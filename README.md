apiMobitrans
============

An API for the mobitrans.fr web service via pages scrapping made with nodeJs licensed under the terms of the GNU GPLv3.

Installation
------------

### Prerequisites

You will need to have nodeJs and npm installed.
Under any debian-like simply do `sudo apt-get install nodejs npm` in a terminal console

1. Clone the project
2. In a terminal console, go to the project's directory then run `npm install` to install the project's dependencies
3. Run the API server with the default  by typing `node app.js` in a terminal console
4. Open the following URL in a browser : http://127.0.0.1:1337/scrap/ (adapt to feat your needs)

Configuration
-------------

All the default settings are in the default.settings.json file.

Here is the default one : 
	{
		"operators": [
			"tam",
			"tag",
			"citura",
			"tao"
		],
		"secret": "MySecret",
		"port": 1337
	}

`operators` is an array of strings listing all the operators names to use
`secret` is a string used to create a special URL for the first scrap
`port` is an integer determining the port on wich the server will listen.

If you want your own configuration, just edit this file or create a new one with a new name like «production.settings.json».
To specify to the app the settings file you want to use, use the environment variables like `SETTINGS=production node app.js`

Hosting
-------

### Private server

A good thing is to use the [Forever](https://github.com/nodejitsu/forever) tool to launch your server. Install it is easy via a simple `sudo npm -g install forever`
[Lean more about forever](https://github.com/nodejitsu/forever).

### NodeJitsu

[NodeJitsu](https://www.nodejitsu.com/) is a professional hosting service dedicated to nodeJs apps. The distributed package.json file in this repo is ready to be deployed on nodejitsu, modulo some personal tweaks as the `name`, `domains` and `subdomain` vars.


Usage
-----

The API is a rest API wich serve XML or JSON formatted datas dependng on extension or http header «Accept» (first has precedence). By default (ie without specifying an extension, JSON will be served)

`/scrap/MySecret` : perform the very first scrap, to list lines, stop, junctions for all operators
`/viewStorage/MySecret{.json|.xml}` : url to call to have a look to the whole storage
`/:operator/getLines{.json|.xml}` : get all infos for all lines
`/:operator/getLine/:line{.json|.xml}` : get all infos for a line

`/:operator/getStops{.json|.xml}` : get all infos for all stops
`/:operator/getStop/:stop{.json|.xml}` : get all infos for a stop

`/:operator/getArrivals/:stop/:line{.json|.xml}` : get the arrivals for a stop on a line
`/:operator/getArrivals/:stop{.json|.xml}` : get all the arrivals for a stop from all lines
`/:operator/getArrivalsAtStop{.json|.xml}` : // same as above
`/:operator/getArrivalsAtLine/:line/forStop/:stop{.json|.xml}` : same as above
`/:operator/getArrivalsAtStop/:stop.{.json|.xml}` : get all arrvivals at a stop from all lines

`:operator` must be one of the listed operators in the settings file
`:line` must be a line id
`:stop` must be a stop id

