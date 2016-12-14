#!/bin/bash
node index.js 13 -77.036366 512 HYP_50M_SR_W/HYP_50M_SR_W.tif output.png
node index.js 13 -77.036366 5400 HYP_50M_SR_W/HYP_50M_SR_W.tif output_large.png
node index.js 11 -77.036366 512 BlueMarbleNG-TB_2004-12-01_rgb_3600x1800.TIFF output_blue.png 
node index.js 11 -77.036366 1800 BlueMarbleNG-TB_2004-12-01_rgb_3600x1800.TIFF output_blue_large.png 
