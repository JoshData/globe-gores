var fs = require("fs");
var Canvas = require('canvas');
var proj4 = require('proj4');
var turf = require('turf');
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
        + ' -s_srs "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs"'
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

function draw_geojson(fn, ctx, style) {
  // Draws features in a GeoJSON file.

  // Read the file.
  var geo = JSON.parse(fs.readFileSync(fn));
  if (geo.type != "FeatureCollection") throw "hmm";
  
  // assign colors to polygons that are consistent accross gores
  // so that adjacent polygons don't have the same color
  if (!style.fillStyle)
    geo = fiveColorMap(geo);

  var refill = {
    '#fbb4ae': 'rgba(255,255,0, .3)',
    '#b3cde3': 'rgba(190,255,40,.25)',
    '#ccebc5': 'rgba(225,225,40,.15)',
    '#decbe4': 'rgba(220,225,10,.3)',
    '#fed9a6': 'rgba(255,220,10,.3)'
  };
  
  drawGores(function(gore_meridian) {
    console.log(fn, gore_meridian, "...");
    geo.features.forEach(function(feature) {
        draw_geometry(
          feature,
          {
            strokeStyle: 'rgba(220,220,220,.25)' || style.strokeStyle,
            fillStyle: refill[feature.properties.fill] || style.fillStyle,
          },
          ctx);
        draw_feature_label(feature, feature.properties.abbrev || feature.properties.name, style, ctx);
      });
  })
}

function draw_geometry(feature, style, ctx) {
  if (feature.geometry.type == "MultiPolygon")
    feature.geometry.coordinates.forEach(function(poly) { draw_polygon(turf.polygon(poly), style, ctx); })
  else if (feature.geometry.type == "Polygon")
    draw_polygon(feature, style, ctx);
  else
    throw geom.type;
}

function draw_feature_label(feature, label, style, ctx) {
  // Draw label at the center of the largest polygon
  // (i.e. draw label once for the whole geometry).

  var poly = null;
  var poly_area = 0;
  function find_largest_polygon(geom) {
    if (geom.type == "MultiPolygon")
      return geom.coordinates.forEach(function(poly) {
        find_largest_polygon({
          "type": "Polygon",
          "coordinates": poly
        }) });
    if (geom.type != "Polygon")
      throw geom.type;

    var a = turf.area(geom);
    if (a < 1000000000) return; // don't label really small features
    if (a > poly_area) {
      poly = geom;
      poly_area = a;
    }
  }
  find_largest_polygon(feature.geometry);
  if (!poly) return;

  // Buffer the labels to be drawn later.
  // TODO: Better label positioning than centroid.
  // TODO: Maybe better to run turf on projected coordinates rather than lat/lng?
  var pt_src = turf.pointOnSurface(poly).geometry.coordinates;
  var pt = ctx.proj(pt_src);
  var pt0 = ctx.proj([pt_src[0] - goreWidth/50, pt_src[1]]);
  var pt1 = ctx.proj([pt_src[0] + goreWidth/50, pt_src[1]]);
  ctx.font = '20px Gentium'; // TODO see below
  var te = ctx.measureText(label);
  pt[0] -= te.width/2;
  pt[1] += te.actualBoundingBoxAscent/2;
  ctx.labels.push({
    text: label,
    box: [ pt, // draw origin
      [pt[0]+te.width+.5, pt[1]], // add buffer to avoid labels exactly next to each other
      [pt[0]+te.width+.5, pt[1]+te.actualBoundingBoxAscent+te.actualBoundingBoxDescent+.5],
      [pt[0], pt[1]+te.actualBoundingBoxAscent+te.actualBoundingBoxDescent+.5],
      pt ],

    // Compute the rotation of the projection at this location, so that the label
    // can be parallel to the lines of latitude there, which helps indicate where
    // north is.
    rotation: Math.atan2(pt1[1]-pt0[1], pt1[0]-pt0[0]),
    priority: -poly_area
  })
}

function draw_polygon(feature, style, ctx) {
  // After projecting, the polygon may have kinks. While cairo draws the stroke
  // correctly in that case, it draws the fill incorrectly and flood-fills the
  // whole clip area.

  // Skip really tiny polygons, which turn out to have some problems.
  var area = turf.area(feature);
  if (area < 1000000000) return;

  // Project the points...
  feature = turf.polygon(feature.geometry.coordinates.map(function(ring) {
    return ring.map(function(pt) { return ctx.proj(pt) });
  }));

  // Check for kinks.
  var kinks = turf.kinks(feature);
  if (kinks.features.length) {
    // There are kinks. Removing them turns out to be hard. The kinks occur all over
    // the map. Plausible ways to remove them -- simplepolygon and turf.intersect
    // with the clipping region of the gore -- all have problems.
    //
    // turf.simplify alone fixes it in some cases, and the remaining polygons are
    // minor and we can skip drawing them, I think.
    //console.log(style.label, area);
    feature = turf.simplify(feature);
    kinks = turf.kinks(feature);
    if (kinks.features.length) {
      console.log("skipping a polygon in", style.label)
      return;
    }
  }

  draw_polygon2(feature, style, ctx);
}

function draw_polygon2(feature, style, ctx) {
  // We can't draw a polygon directly because if it has inner rings,
  // those should be holes. turf.tesselate will give us back an array
  // of triangles that we can draw. It's quite expensive to draw
  // tiny triangles with Cairo unfortunately, so we only use it when
  // necessary.

  function fill_ring(ring) {
    // Construct the path.
    ctx.beginPath();
    ring.forEach(function(pt) {
      ctx.lineTo(pt[0], pt[1]);
    })

    // Fill.
    if (style.fillStyle) {
      // TODO: Inner rings
      ctx.fillStyle = style.fillStyle;
      ctx.fill();
    }
  }

  function outline_ring(ring) {
    // Construct the path.
    ctx.beginPath();
    ring.forEach(function(pt) {
      ctx.lineTo(pt[0], pt[1]);
    })

    // Stroke.
    if (style.strokeStyle) {
      ctx.strokeStyle = style.strokeStyle;
      ctx.stroke();
    }
  }

  if (feature.geometry.coordinates.length == 1) {
    // There is only an outer ring, so no need to tesselate.
    fill_ring(feature.geometry.coordinates[0]);
  } else {
    // There are inner rings, so tesselate.
    turf.tesselate(feature).features.forEach(function(geom) {
      fill_ring(geom.geometry.coordinates[0]);
    });
  }

  // Outline -- cannot be based on tesselation.
  outline_ring(feature.geometry.coordinates[0]);
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

function drawGores(func) {
  // Calls func(gore_index) for each gore, setting a clipping region
  // before each call.
  for (var gore_index = 0; gore_index < numGores; gore_index++) {
    //if (gore_index != 4) continue;

    // Save the unclipped context.
    ctx.save();

    // Store which gore we're drawing.
    ctx.gore_index = gore_index;
    ctx.gore_meridian = (goreWidth * gore_index) + (180 + prime_meridian + goreWidth/2);

    // Create a clipping region to only draw content within the gore.
    // The gore is the region between the meridians at [-goreWidth/2,goreWidth/2].
    ctx.clip_region = [];
    var goreSteps = canvas.height;
    for (var i = 0; i <= goreSteps; i++)
      ctx.clip_region.push([ctx.gore_meridian-goreWidth/2, -90 + i*180/goreSteps]);
    for (var i = 0; i <= goreSteps; i++)
      ctx.clip_region.push([ctx.gore_meridian+goreWidth/2,  90 - i*180/goreSteps]);
    ctx.clip_region.push(ctx.clip_region[0]); // make it a valid linear ring

    // Set the path.
    ctx.beginPath();
    ctx.clip_region.forEach(function(pt) { ctx.lineToPt(pt); });
    ctx.closePath();

    // Draw gore outline. (This function may be called multiple times so
    // we may be drawing this many times. TODO: Move to a new function.)
    ctx.strokeStyle = 'rgba(200,200,200,1)';
    ctx.stroke();

    // Clip the drawing to that path.
    ctx.clip();

    // Draw the map.
    ctx.labels = [];
    func(ctx.gore_meridian);

    // Draw the buffered labels.
    var drawn_labels = [];
    ctx.labels.sort(function(a, b) { return a.priority - b.priority; })
    ctx.labels.forEach(function(label) {
      // Skip if it would intersect with an existing label.
      var bad = false;
      drawn_labels.forEach(function(drawn_label) {
        if (turf.intersect(
          turf.polygon([drawn_label.box]),
          turf.polygon([label.box]))
          != null)
          bad = true;
      });
      if (bad) return;

      ctx.save();
      ctx.font = '20px Gentium'; // TODO see above
      ctx.fillStyle = 'rgba(10,10,10,1)';
      ctx.translate(label.box[0][0], label.box[0][1])
      ctx.rotate(label.rotation); // this messes up the bbox but whatever
      ctx.fillText(label.text, 0,0);
      ctx.restore();
      drawn_labels.push(label);
    })

    // Clear the clipping region for the next iteration.
    ctx.restore();
  }
}

// Draw a raster base layer.
if (process.argv[5])
  draw_raster(process.argv[5])

// Draw vector layer(s) on top.
if (process.argv[6])
  draw_geojson(process.argv[6], ctx, {});

// Save.
fs.writeFileSync(process.argv[7] || 'output.png', canvas.toBuffer());
