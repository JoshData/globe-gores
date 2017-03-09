Map Gores
=========

The Node.js script in this repository can be used to draw globe gores, i.e. an [interrupted map](http://www.progonos.com/furuti/MapProj/Normal/ProjInt/projInt.html) made out of pieces that could be pasted onto the surface of a sphere.

Here is a composite of gores from multiple source raster/vector sources:

![Map Gores](output/combined_1600.png)

From left to right:

* [CRU TS3.24.01 (Jan. 1901- Dec. 2015)](http://catalogue.ceda.ac.uk/uuid/3df7562727314bab963282e6a0284f24), mean daily temperatures 2011-2015, Centre for Environmental Data Analysis, University of East Anglia Climatic Research Unit (Harris, I.C.; Jones, P.D. (2017)). (The data is used under a license -- please retain the attribution above if you reuse the image.) With [Natural Earth](http://www.naturalearthdata.com/downloads/) country vector outlines.

* [NASA Goddard Space Flight Center - Blue Marble (2002, land surface, ocean color, sea ice and clouds)](http://visibleearth.nasa.gov/view.php?id=57735)
	
* [NASA Earth Observatory - Night Lights (2012)](http://visibleearth.nasa.gov/view.php?id=79765)

* [NASA Earth Observatory - Blue Marble Next Generation (December 2004) with Topography and Bathymetry](http://visibleearth.nasa.gov/view.php?id=73909)

* [Natural Earth - Gray Earth with Shaded Relief, Hypsography, Ocean Bottom, and Drainages](http://www.naturalearthdata.com/downloads/10m-raster-data/10m-gray-earth/)

Mathematics
-----------

The gores are made from the center region of the [Lambert Azimuthal Equal Area projection](https://en.wikipedia.org/wiki/Lambert_azimuthal_equal-area_projection) bounded by symmetric lines of longitude:

![Lambert Azimuthal Equal Area projection](https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Lambert_azimuthal_equal-area_projection_SW.jpg/300px-Lambert_azimuthal_equal-area_projection_SW.jpg)

I chose this projection because:

* The area bounded by symmetric lines of longitude around the central meridian is a shape that looks like a [globe gore](https://en.wikipedia.org/wiki/Gore_%28segment%29). Cylindrical projections like Mercator wouldn't work --- they would produce rectangular strips. Other plausible projections include [sinusoidal](https://en.wikipedia.org/wiki/Sinusoidal_projection) and [polyconic](https://en.wikipedia.org/wiki/Polyconic_projection).
* It is an equal-area projection, which means the map doesn't give more area to some parts of the world than others --- and that's just fair. (Sinusoidal would also work, but not polyconic.)
* It's roughly shape-preserving, e.g. the lines of latitude intersect the lines of longitude at very close to right angles near the center line of longitude, which means that if the gores were actually placed on a sphere there wouldn't be abrupt changes where the gores meet. (Sinusoidal is less shape-preserving, polyconic may be more.)

(For real globe gores, shape-preserving is probably most valuable so there aren't abrupt angles at the intersections of the gores. Polygonic might be more shape-preserving, and might ultimately fit a sphere better. But since you probably won't be putting these gores on an actual globe, prioritizing equal-area makes more sense to me, and I had trouble using polygonic in practice. For more on valuable aspects of projections for globe gores, see [https://www.mapthematics.com/Downloads/Gores.pdf](https://www.mapthematics.com/Downloads/Gores.pdf).)

Each gore is created by making a separate projection centered at a different line of longitude, rotating around the earth.

Implementation
--------------

The gore is created by using:

* `gdalwarp` to draw a base layer from a GeoTIFF raster image
* vector data in a GeoJSON file
* the Cario graphics drawing library, which creates high-quality raster images

To run:

Install the node-canvas (a Cairo wrapper) dependencies for your platform:

	https://github.com/Automattic/node-canvas

Install node dependencies:

	npm install

Fetch GIS data:

	./fetch_world_data.sh

Generate the map:

	# node index.js num_gores prime_meridian map_height raster_tiff
	node index.js 13 -77.036366 512 HYP_50M_SR_W/HYP_50M_SR_W.tif

Edit the parameters at the top of index.js for a larger map or to change the number of gores.

GeoTIFF Sources
---------------

* [Natural Earth](http://www.naturalearthdata.com/downloads/) (shaded relief; up to 21,600x10,800)
* [Visible Earth (NASA)](http://visibleearth.nasa.gov/) ([blue marble](http://visibleearth.nasa.gov/view_cat.php?categoryID=1484), [night lights](http://visibleearth.nasa.gov/view.php?id=79765); up to 54,000x27,000)

Weather Data
------------

The U.S. National Weather Service's Global Forecast System (GFS) offers real-time(-ish) global weather data through [NOMADS](http://nomads.ncep.noaa.gov/) in the GRIB2 format. The author of https://github.com/cambecc/earth figured out how to pull a slice of the data from the 1-degree resolution dataset.

	YYYYMMDD=$(date --iso-8601=date | sed s/-//g)
	curl "http://nomads.ncep.noaa.gov/cgi-bin/filter_gfs.pl?file=gfs.t00z.pgrb2.1p00.f000&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on&dir=%2Fgfs.${YYYYMMDD}00" -o gfs.t00z.pgrb2.1p00.f000


Other Data Sources
------------------

See https://github.com/cambecc/earth for how to get global weather data.
