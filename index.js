var fs = require("fs");
var Canvas = require('canvas');
var proj4 = require('proj4');
var fiveColorMap = require('five-color-map');
var execSync = require('child_process').execSync;

// How many gores to make? An odd number is nicer
// because then the prime merdian is not cut by
// an interruption.
var numGores = parseInt(process.argv[2]) || 13;

// Where (what longitude) is the center of the map?
var prime_meridian = parseFloat(process.argv[3]) || -77.036366; // Washington, DC

// How large is the map, in pixels of height? The width
// will be computed to fit all of the gores (plus gutters
// between them).
var map_height = parseInt(process.argv[4]) || 512;

// How much spacing between gores, relative to their width?
var goreGutter = .075; // 7.5%

function projection_projstring(prime_meridian) {
  // Choose a projection:
  // laea: Lambert Azimuthal Equal Area
  // poly: American Polyconic - Would also be reasonable but polygons don't
  //       render quite right.
  // The Earth is a little flat, so supply a proper minor axis radius.
  var b = 1-1/298.257223563
  return '+proj=laea +lat_0=0 +lon_0=' + prime_meridian + ' +x_0=0 +y_0=0 +a=1 +b=' + b + ' +no_defs'
}

// Projection helpers.
function projection(pt, gore_meridian) {
  return proj4(
  	// Although WGS84 is the Proj4 default, be explicit about the input projection
  	// per http://www.naturalearthdata.com/features/.
  	"+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs",

  	// The map projection is defined above.
  	projection_projstring(gore_meridian || 0)

  	// Add this spherical coordinates hack. There is something wrong in either the
    // raster warping or vector projection. The output of gdalwarp does not line
    // up with the projected vector data exactly, even when the source/target
    // projections are identical. The latitude values shift/stretch around 45 degrees
    // latitude slightly, which I've seen many times when there's a discrepancy in
    // treating lat/long as on the ideal sphere or on a correct ellipsoid from the
    // WGS84 datum. This hack fixes the problem by instructing proj4 to treat the
    // WGS84 ellipsoid coordinates in the vector data as if they were actually
  	// spherical coordinates. This is wrong, but it makes the raster and vector data
    // line up. The Natural Earth raster image data lines up with the Natural Earth
    // vector data perfectly, so the two datasets correctly have the same projection.
    // Also, adding this hack to gdalwarp doesn't change the output, so we know
    // gdalwarp isn't applying a WGS84=>spherical transformation. The problem is
    // either 1) a gdalwarp bug, or 2) an error in the raster metadata causing gdalwarp
    // to think the source is in spherical coordinates already, or 3) a combination
    // of the source being in spherical coordinates already (an error in the Natural
    // Earth metdata & documentation) *and* proj4 (but not gdalwarp) incorrectly
    // applying a WGS84=>spherical transformation. I have no way to know which is
    // the problem.
  	// (See https://trac.osgeo.org/proj/wiki/FAQ.)
  	  + " +nadgrids=@null",
  	pt);
}
var proj_h = projection([0,90])[1]*2; // height of the map in projected units
var proj_w = projection([179.9999,0])[0]*2; // width of the map in projected units
var goreWidth = 360/numGores;
var proj_gore_w = projection([goreWidth/2,0])[0]*2; // width of a single gore in projected units

function draw_raster(image_file) {
  // Warp and draw a raster image in lat-long projection.

  drawGores(function(gore_meridian) {
      console.log(image_file, gore_meridian, "...");

      // Re-project the raster data from lat-long to our map projection.
      execSync('rm -f /tmp/reprojected.*');
      execSync('gdalwarp -multi -nomd'
        + ' -t_srs "' + projection_projstring(gore_meridian) + '"'

        // output extents, in projected units (half the world (-1 to 1) horizontally is enough to capture the gore),
        // and [-sqrt(2),sqrt(2)] vertically is the height of the prime meridian.
        + ' -te -1 ' + (-proj_h/2) + ' 1 ' + (proj_h/2)

        + ' -ts 0 ' + map_height // same resolution as output
        + ' -r bilinear ' // sligntly better sampling than the default
        + ' -wo SAMPLE_GRID=YES -wo SAMPLE_STEPS=' + (map_height**.5)*20 // fixes a discontinuity at the edges of the source image when the edge is a part of the gore
        + ' ' + image_file
        + ' /tmp/reprojected.tiff');

      // gdalwarp can't emit PNG and PNG is most convenient for Cairo to read.
      execSync('convert -quiet /tmp/reprojected.tiff /tmp/reprojected.png');

      // Draw the raster data. It will be clipped to the gore clipping area.
      img = new Canvas.Image;
      img.src = fs.readFileSync('/tmp/reprojected.png');
      var center_pt = ctx.proj([gore_meridian,0]);
      ctx.drawImage(img, center_pt[0]-img.width/2, center_pt[1]-img.height/2, img.width, img.height);
  })
}

function draw_geojson(fn, ctx, color) {
  // Draws features in a GeoJSON file.

  // Read the file.
  var geo = JSON.parse(fs.readFileSync(fn));
  if (geo.type != "FeatureCollection") throw "hmm";
  
  // assign colors to polygons that are consistent accross gores
  // unfortunately something is causing some of the polygons to
  // fill the whole image
  //if (!color)
  //  geo = fiveColorMap(geo);
  
  drawGores(function(gore_meridian) {
    console.log(fn, gore_meridian, "...");
    geo.features.forEach(function(feature) {
      draw_geometry(
        feature.geometry,
        feature.properties.name,
        color || feature.properties.fill,
        ctx);
    });
  })
}

function draw_geometry(geom, label, color, ctx) {
  if (geom.type == "MultiPolygon")
    geom.coordinates.forEach(function(poly) { draw_polygon(poly, label, color, ctx); })
  else if (geom.type == "Polygon")
    draw_polygon(geom.coordinates, label, color, ctx);
  else
    throw geom.type;
}

function draw_polygon(geom, label, color, ctx) {
  geom.forEach(function(ring) {
    // Construct the path.
    ctx.beginPath();
    ring.forEach(function(pt) {
      ctx.lineToPt(pt);
    })

    // Stroke.
    ctx.strokeStyle = 'rgba(150,150,150,0.5)';
    ctx.stroke();

    // doesnt work because some polygons cause the whole image to be filled
    //ctx.fillStyle = 'black';
    //ctx.fill();
  });
}

// Construct the output image with the correct dimensions, including a gutter
// on all four sides.
var canvas = new Canvas(
  map_height*(proj_gore_w/proj_h*(1+goreGutter))*(360/goreWidth),
  map_height + map_height*(proj_gore_w/proj_h*goreGutter)
  )
var ctx = canvas.getContext('2d');

ctx.proj = function(pt) {
  // Project from lat-long to pixels.

  /*
  // Clip because projections don't like edges.
  if (pt[0] <= -359.999) pt[0] =-359.999;
  if (pt[0] >=  359.999) pt[0] = 359.999;
  if (pt[1] <= -89.999)  pt[1] = -89.999;
  if (pt[1] >=  89.999)  pt[1] =  89.999;
  */

  // Project into map coordinates.
  pt = projection(pt, this.gore_meridian);

  // Scale to [0, 1].
  pt[0] = pt[0]/proj_h + proj_gore_w/proj_h/2;
  pt[1] = -pt[1]/proj_h+.5;

  // Shift each gore on the canvas so they are not overlapping.
  pt[0] += proj_gore_w/proj_h*goreGutter/2;
  pt[0] += proj_gore_w/proj_h*(1+goreGutter) * this.gore_index;

  // Apply the gutter vertically too.
  pt[1] += proj_gore_w/proj_h*goreGutter/2;

  // Scale to image coordinates (pixels).
  return [pt[0]*map_height, pt[1]*map_height];
}

ctx.lineToPt = function(pt) {
  // Calls this.lineTo() but projects the point from lat-long to pixels first.
  pt = this.proj(pt);
  this.lineTo(pt[0], pt[1]);
}

/*ctx.font = '30px Impact';
ctx.rotate(.1);
ctx.fillText("Awesome!", 50, 100);
var te = ctx.measureText('Awesome!');*/

function drawGores(func) {
  // Calls func(gore_index) for each gore, setting a clipping region
  // before each call.
  for (var gore_index = 0; gore_index < numGores; gore_index++) {
    // Save the unclipped context.
    ctx.save();

    // Store which gore we're drawing.
    ctx.gore_index = gore_index;
    ctx.gore_meridian = (goreWidth * gore_index) + (180 + prime_meridian + goreWidth/2);

    // Create a clipping region to only draw content within the gore.
    // The gore is the region between the meridians at [-goreWidth/2,goreWidth/2].
    var goreSteps = canvas.height;
    ctx.beginPath();
    for (var i = 0; i <= goreSteps; i++)
      ctx.lineToPt([ctx.gore_meridian-goreWidth/2, -90 + i*180/goreSteps]);
    for (var i = 0; i <= goreSteps; i++)
      ctx.lineToPt([ctx.gore_meridian+goreWidth/2,  90 - i*180/goreSteps]);
    ctx.closePath();

    // Draw gore outline. (This function may be called multiple times so
    // we may be drawing this many times. TODO: Move to a new function.)
    ctx.strokeStyle = 'rgba(200,200,200,1)';
    ctx.stroke();

    // Clip the drawing to that outline.
    ctx.clip();

    // Draw the map.
    func(ctx.gore_meridian);

    // Clear the clipping region for the next iteration.
    ctx.restore();
  }
}

// Draw a raster base layer.
draw_raster(process.argv[5] || "HYP_50M_SR_W/HYP_50M_SR_W.tif")

// Draw vector layer(s) on top.
draw_geojson("data/countries.json", ctx);
//draw_geojson("data/lakes.json", ctx, "white");

// Save.
fs.writeFileSync(process.argv[6] || 'output.png', canvas.toBuffer());
