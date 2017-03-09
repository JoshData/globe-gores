# Converts CRU ASCII data files of global climate data into a TIFF image
# in the WGS 84 projection.
#
# The CRU ASCII gridded data files are 8-char-fixed+newline delimited grids
# at 0.5-degree spacing. Each grid is therefore 720 columns by 360 rows,
# repeated for each time series point, which is each month in a five-year
# period. Each point is an integer, or -999 for NA, which is scaled depending
# on the data series (tmp is scaled as 10x degrees celcius). The scaling
# doesn't really matter since we'll convert the values to a color range
# anyway.
#
# This script takes the value for each point from the whole time series.
#
# Run as:
#
# cat cru_ts3.24.01.2011.2015.tmp.dat.gz | gunzip | python3 create_cru_image.py > cru_ts3.24.01.2011.2015.tmp.tiff

import sys, re

# Read the ASCII grid.
lines = sys.stdin.readlines()
assert len(lines) == (180*2) * 12 * 5 # five years of data
for line in lines:
  assert len(line) == 8*(360*2) + 1 # each line has the right number of columns

# Create an empty grid.
grid = [([0] * 360*2) for _ in range(180*2)]
grid_n = [([0] * 360*2) for _ in range(180*2)]
while len(lines) > 0:
	# Parse the grid from strings to numbers.
	def parse_entry(entry):
	  val = int(entry)
	  if val == -999:
	    return None
	  return val
	
	grid1 = [[parse_entry(line[8*i:8*(i+1)]) for i in range(360*2)] for line in lines[:180*2]]
	
	assert len(grid1) == 180*2
	for line in grid1: assert len(line) == 360*2

	# Add.
	for y in range(180*2):
		for x in range(360*2):
			if grid1[y][x] != None:
				grid[y][x] += grid1[y][x]
				grid_n[y][x] += 1

	# Pop.
	lines = lines[180*2:]

# Divide by counts, replace zero counts with None's.
for y in range(180*2):
	for x in range(360*2):
		if grid_n[y][x] == 0:
			grid[y][x] = None
		else:
			grid[y][x] /= grid_n[y][x]

# Get all values.
all_values = [v for v in sum(grid, []) if v is not None]

# Find the range of values for creating a nice color scale, ignoring outliers
# by computing at the 5th and 95th percentile.
all_values.sort()
min_value  = all_values[int(.05*len(all_values))]
mid_value1 = all_values[int(.45*len(all_values))]
med_value  = all_values[int(.55*len(all_values))]
mid_value2 = all_values[int(.75*len(all_values))]
max_value  = all_values[int(.95*len(all_values))]

# Create a color scale.
import spectra
colors1 = spectra.scale\
	([ "purple", "blue", "green" ])\
	.domain([min_value, mid_value1, med_value])
colors2 = spectra.scale\
	([ "green", "orange", "red" ])\
	.domain([med_value, mid_value2, max_value])

# Create an image.
from PIL import Image
im = Image.new("RGBA", (360*2, 180*2), color=(0,0,0,255))
for y, line in enumerate(grid):
  for x, val in enumerate(line):
   if val == None: continue # leave as default color, specified in image creation
   val = min(max(val, min_value), max_value) # clip
   colors = colors1 if (val < med_value) else colors2
   rgb = colors(val).values
   rgba = (int(rgb[0]*255), int(rgb[1]*255), int(rgb[2]*255), 255)
   im.putpixel((x,(180*2)-y-1), rgba)

# Save.
im.save(sys.stdout.buffer, "TIFF")
