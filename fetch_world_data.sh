#!/bin/bash

fetch() {
  echo "$1<=$2"
  wget -O /tmp/shpfile.zip $2
  shp2jsonx /tmp/shpfile.zip $1
  rm -f /tmp/shpfile.zip
}

if [ ! -f ~/.nvm/$(node --version)/bin/shp2jsonx ]; then
  npm install -g shp2jsonx
fi

mkdir -p data
SCALE=50m # also 10m, 50m

wget -O HYP_50M_SR_W.zip http://naciscdn.org/naturalearth/$SCALE/raster/HYP_50M_SR_W.zip
unzip HYP_50M_SR_W.zip

fetch data/countries.json http://naciscdn.org/naturalearth/$SCALE/cultural/ne_$SCALE\_admin_0_countries.zip
#fetch data/lakes.json http://naciscdn.org/naturalearth/$SCALE/physical/ne_$SCALE\_lakes.zip
