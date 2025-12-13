#!/bin/bash
apt-get -y install xorg chromium dnsmasq chromium-browser git hostapd i2c-tools iotop nodejs x11vnc tcpdump openbox xorg build-essential python3 g++ make libatomic1 i2c-tools libi2c-dev


# Remove any old Node
sudo apt-get remove -y nodejs

# Add NodeSource repo for Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js 20 + npm
sudo apt-get install -y nodejs build-essential python3 g++ make



#/etc/xdg/openbox/autostart

