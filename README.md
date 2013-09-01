apiMobitrans
============

An API for the mobitrans.fr web service via pages scrapping made with nodeJs licensed under the terms of the GNU GPLv3.

Warning
-------

This API is, at the moment, must be seen as a «work in progress» or «experimental stage»

Installation
------------

### Prerequisites

You will need to have nodeJs, npm (the nodeJs packet manager) and [redis](http://redis.io/) installed.
Under any debian-like simply do `sudo apt-get install nodejs npm redis-server` in a terminal console

### Quick start

1. Clone the project
2. In a terminal console, go to the project's directory then run `npm install` to install the project's dependencies
3. Run the API server with the default  by typing `node app.js` in a terminal console
4. Open the following URL in a browser : http://127.0.0.1:1337/scrap/MySecret (if you are using it on your own machine)
5. Restart the server ([Ctrl]+[C] then `node app.js`)

During the first scrap, a «storage.json» file is created to store the datas.

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
		"port": 1337,
		"redis": {
			"host": "127.0.0.1",
			"port": 6379,
			"password": null
		}
	}

* `operators` is an array of strings listing all the operators names to use
* `secret` is a string used to create a special URL for the first scrap
* `port` is an integer determining the port on wich the server will listen.
* `redis` is an object of parameters to configure the redis client

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

The API is a rest API wich serve, HTML, XML or JSON formatted datas dependng on extension (first has precedence). By default (ie without specifying an extension, HTML will be served)

* `/scrap/MySecret` : perform the very first scrap, to list lines, stop, junctions for all operators
* `/viewStorage/MySecret{null|.html|.json|.xml}` : url to call to have a look to the whole storage
* `/:operator/lines{null|.html|.json|.xml}` : get all infos for all lines [example](http://apimobitrans.modulaweb.fr/tam/lines.json)
* `/:operator/lines/:line{null|.html|.json|.xml}` : get all infos for a line [example](http://apimobitrans.modulaweb.fr/tam/lines/line_3.json)
* `/:operator/stops{null|.html|.json|.xml}` : get all infos for all stops [example](http://apimobitrans.modulaweb.fr/tam/stops.json)
* `/:operator/stops/:stop{null|.html|.json|.xml}` : get all infos for a stop [example](http://apimobitrans.modulaweb.fr/tam/stops/stop_albert-1er.json)
* `/:operator/arrivals/:stop/:line{null|.html|.json|.xml}` : get the arrivals for a stop on a line [example](http://apimobitrans.modulaweb.fr/tam/arrivals/stop_albert-1er/line_1.json)
* `/:operator/arrivals/:stop{null|.html|.json|.xml}` : get all the arrivals for a stop from all lines [example](http://apimobitrans.modulaweb.fr/tam/arrivals/stop_albert-1er.json)
* `/:operator/arrivalsAtStop/:stop/forLine/:line{null|.html|.json|.xml}` : same as above [example](http://apimobitrans.modulaweb.fr/tam/arrivalsAtStop/stop_albert-1er/forLine/line_1.json)
* `/:operator/arrivalsAtLine/:line/forStop/:stop{null|.html|.json|.xml}` : same as above [example](http://apimobitrans.modulaweb.fr/tam/arrivalsAtLine/line_1/forStop/stop_albert-1er.json)
* `/:operator/arrivalsAtStop/:stop.{null|.html|.json|.xml}` : get all arrvivals at a stop from all lines [example](http://apimobitrans.modulaweb.fr/tam/arrivalsAtStop/stop_albert-1er.json)

Where : 

* `:operator` must be one of the listed operators in the settings file
* `:line` must be a line id
* `:stop` must be a stop id