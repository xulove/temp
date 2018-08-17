<<<<<<< HEAD
Hcd Network Stats
============

This is a visual interface for tracking hcd network status. It uses WebSockets to receive stats from running hcd daemon and output them through an angular interface.

## Prerequisite
* node
* npm

## Installation
Make sure you have node.js and npm installed.

Clone the repository and install the dependencies

```bash
git clone https://github.com/HcashOrg/hc-netstats
cd hc-netstats
npm install
sudo npm install -g grunt-cli
```

##Build the resources
In order to build the static files you have to run grunt tasks which will generate dist directory with the static js and css files, fonts and images.


To build the full version run
```bash
grunt
```

##Run

Change your credentials in `lib/utils/config.json`
You need to set user, password and full path to the rpc.cert

Install pm2 package globally
```
npm install -g pm2
```

And run application
```
pm2 startOrRestart package.json --env=production
```

see the interface at http://localhost:3000
=======
# temp
临时存放目录
>>>>>>> 11d8ca989bea82dc94b7160c2a401585b20d930f
