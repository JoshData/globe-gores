#!/bin/bash

fetch_shapefile() {
  echo "$1<=$2"
  wget -O /tmp/shpfile.zip $2
  shp2jsonx /tmp/shpfile.zip $1
  rm -f /tmp/shpfile.zip
}

if [ ! -f ~/.nvm/$(node --version)/bin/shp2jsonx ]; then
  npm install -g shp2jsonx
fi

mkdir -p data

# Raster data for base layers:

# Natural Earth - Gray Earth with Shaded Relief, Hypsography, Ocean Bottom, and Drainages
wget -P data http://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/raster/GRAY_HR_SR_OB_DR.zip
unzip -d data data/GRAY_HR_SR_OB_DR.zip

# NASA - Visible Earth - Blue Marble Next Generation (December 2004)
wget -O data/nasa_visibleearth_bluemarble.png http://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x21600x10800.png
convert data/nasa_visibleearth_bluemarble.png data/nasa_visibleearth_bluemarble.tiff

# NASA - Visible Earth - Blue Marble (2002, LAND SURFACE, OCEAN COLOR, SEA ICE AND CLOUDS)
wget -O data/nasa_visibleearth_bluemarble_clouds.tiff http://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57735/land_ocean_ice_cloud_8192.tif

# NASA - Visible Earth - Night Lights 2012
wget -O data/nasa_visibleearth_nightlights.tiff http://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.13500x6750_geo.tif
# even higher resolution: http://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.54000x27000_geo.tif

# Vector data for some outlines:

SCALE=10
fetch_shapefile data/countries.json http://naciscdn.org/naturalearth/$SCALE/cultural/ne_$SCALE\_admin_0_countries.zip
#fetch_shapefile data/lakes.json http://naciscdn.org/naturalearth/$SCALE/physical/ne_$SCALE\_lakes.zip
