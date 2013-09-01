/*
API Mobitrans

Author : jean-François VIAL <http://about.me/Jeff_>
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>
*/

var http = require('http')
  , eventsMaster = require('events')
  , events = new eventsMaster.EventEmitter()
  , cheerio = require('cheerio')
  , slug = require('slugg')
  , Redis = require('redis')
  , redis = null
;

var redisConnect = function(settings) {
	if (redis == null) {
		redis = Redis.createClient(settings.redis.port, settings.redis.host);
		redis.auth(settings.redis.password, function (err) { if (err) throw err; });
	}
	return redis;
}

var stripTags = function(str) {
	return str.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi,'').replace(/<!--[\s\S]*?-->/gi,'');
}

var objectToArray = function(obj) {
	var arr =[];
	for ( var i in obj ) {
	    arr.push(obj[i]);
	}
	return arr;
}

var parseArrivals = function(toBeParsed) {
	$ = cheerio.load(toBeParsed);
	
	// test if there is the «no information at this time» message on the page
	if ($('div.corpsL').find('span.white').length > 0) {
		if ($('div.corpsL span.white').html().match(/disponible/i)) {
			return false;
		}
	}

	// cleanup the unwanted elements
	$('div.corpsL br, div.corpsL span, div.corpsL a').remove();
	// extract and clean the interesting zone
	var interestingZone = $('div.corpsL')
		.html() // get the html
		.trim() // trim the spaces
		.replace(/\t|\n/g,'') // remove tabs and newlines
		.replace(/ {2,}/g,'|') // replace the multiple spaces by a pipe (easier to parse)
		.replace(/<b>!<\/b> /g,'*') // replace the <b>!</b> element by a * → indicate that its a theoric time, not real time
		.replace(/(n|\d) (\*?P)/g,'$1|$2') // when the time is in hours, the spaces are different between times
	;

	// extract each interesting parts
	var preparsed = interestingZone.match(/<b>Vers [^<]*<\/b>|\*?Prochain passage : [^|<]*/g);

	var directions = {};
	var currentDirection = null;
	var currentDirectionSlug = null;

	// for each interesting parts
	for (var i in preparsed){
		preparsed[i] = stripTags(preparsed[i]);
		if (preparsed[i].match(/^Vers /,'')) {
			// if the part contains, the term «Vers », its a direction
			currentDirection = preparsed[i].replace(/Vers /,'');
			currentDirectionSlug = slug(currentDirection);
			directions[currentDirectionSlug] = {
				name: currentDirection
				, times: []
			};
		} else {
			// its not a direction, so its a time : lets parse it
			var time = preparsed[i].replace(/\*?Prochain passage : /,'');
			if (time.match(/proche/)) {
				// time = «Départ proche»
				time = {
					time: 0
					, theoric: false
				};
				if (preparsed[i].match(/\*/)) {
					// not realtime
					time.theoric = true;
				}
			} else {
				// time is in minutes 
				if (time.match(/min/)) {
					time = {
						time: parseInt(time.replace(/min/,''))
						, theoric: false
					};
				} else {
					// time is in hours
					var t = time.split('h');
					time = {
						time: parseInt(t[0])*60 + parseInt(t[1])
						, theoric: false
					}
				}
				if (preparsed[i].match(/\*/)) {
					// not realtime
					time.theoric = true;
				}
			}
			directions[currentDirectionSlug].times.push(time);
		}
	}
	return directions;
}

var getArrivals = function(operator, stop, line) {
	var params = operator.stops[stop].lines[line].url;
	params.sessionId = operator.sessionId;

	var path = '/index.php?p='+params.p+'&id='+params.id+'&m=1&I='+params.sessionId+'&rd='+params.rd;

	var operatorDatas = {
		name: operator.name
		, cookie: operator.cookie
	};

    http
      .request(
        {
          host: operatorDatas.name + '.mobitrans.fr'
          , headers: {
            'Cookie': operatorDatas.cookie.name + '=' + operatorDatas.cookie.value
            , 'User-Agent': 'Mozilla/5.0'
          }
          , path: path
        }
        , function(response) {
          var body = '';
          response
            .on('data', function(chunk) {
              body += chunk;
            })
            .on('end', function() {
            	events.emit('arrivals',parseArrivals(body), line);
            })
          ;
        }
      )
      .on('error', function(e) {
        console.log(operatorDatas.name + ' : Got error: ' + e.message);
        events.emit('arrivals',false);
      })
      .end()
    ;
}

var getLines = function(req, res) {
	if (req.params.line) {
		// One line requested
		//cleanup and reformat data
		var thisLine = JSON.parse(JSON.stringify(req.operator.lines[req.params.line])); // clone object
		for (var s in thisLine.stops) {
			for (var l in thisLine.stops[s].lines) {
				delete thisLine.stops[s].lines[l].url
			}
			// create an array with a cloned object
			thisLine.stops[s].connections = objectToArray(JSON.parse(JSON.stringify(thisLine.stops[s].lines)));
			delete thisLine.stops[s].lines;
		}
		thisLine.stops = objectToArray(thisLine.stops);
		var response = {line: thisLine};
	} else {
		// All lines requested
		var thoseLines = JSON.parse(JSON.stringify(req.operator.lines)); // clone object
		for (var i in thoseLines) {
			for (var s in thoseLines[i].stops) {
				for (var l in thoseLines[i].stops[s].lines) {
					delete thoseLines[i].stops[s].lines[l].url
				}
				// create an array with a cloned object
				thoseLines[i].stops[s].connections = objectToArray(JSON.parse(JSON.stringify(thoseLines[i].stops[s].lines)));
				delete thoseLines[i].stops[s].lines;
			}
			thoseLines[i].stops = objectToArray(thoseLines[i].stops);
		}
		thoseLines = objectToArray(thoseLines);
		var response = {lines: thoseLines};
	}

	res.sendData(response);
};

var getStops = function(req, res) {
	if (req.params.stop) {
		var thisStop = JSON.parse(JSON.stringify(req.operator.stops[req.params.stop])); // clone object
		for (var l in thisStop.lines) {
			delete thisStop.lines[l].url;
		}
		// create an array with a cloned object
		thisStop.connections = objectToArray(JSON.parse(JSON.stringify(thisStop.lines)));
		delete thisStop.lines;
		var response = {stop: thisStop};
	} else {
		var thoseStops = JSON.parse(JSON.stringify(req.operator.stops)); // clone object
		for (var i in thoseStops) {
			for (var l in thoseStops[i].lines) {
				delete thoseStops[i].lines[l].url;
			}
			// create an array with a cloned object
			thoseStops[i].connections = objectToArray(JSON.parse(JSON.stringify(thoseStops[i].lines)));
			delete thoseStops[i].lines;
		}
		thoseStops = objectToArray(thoseStops);
		var response = {stops: thoseStops};
	}
	res.sendData(response);
};

var getArrivalsForStopLine = function(req, res) {
	redisConnect(req.settings);
	var key = slug('arrivals_' + req.operator + '_' + req.params.stop + '_' + req.params.line);
	// test if the datas are stored, if not, scrap them and store them temporarily
	redis.get(key,function(err,response){
		if (response) {
			res.sendData(JSON.parse(response));
		} else {
			events.on('arrivals', function(data, line) {
				redis.setex(key,30,JSON.stringify(data));
				res.sendData(data);
			});
			getArrivals(req.operator, req.params.stop, req.params.line);
		}
	});
};

var getArrivalsAtStop = function(req, res) {
	redisConnect(req.settings);
	var key = slug('arrivals_' + req.operator + '_' + req.params.stop);
	// test if the datas are stored, if not, scrap them and store them temporarily
	redis.get(key,function(err,response){
		if (response) {
			res.sendData(JSON.parse(response));
		} else {
			var lines = req.operator.stops[req.params.stop].lines;
			var arrivals = {};
			events.on('arrivals', function(data, line) {
				arrivals[line] = {
					line: {
						name: req.operator.lines[line].name
						, id: line
					}
					, arrivals: data
				};
				
				if (Object.keys(arrivals).length == Object.keys(lines).length) {
					redis.setex(key,30,JSON.stringify(arrivals));
					res.sendData(arrivals);
				}
			});

			for (var line in lines) {
				getArrivals(req.operator, req.params.stop, line);
			}
		}
	});
};

exports.getLines = getLines;
exports.getStops = getStops;
exports.getArrivals = getArrivals;
exports.getArrivalsAtStop = getArrivalsAtStop;
exports.getArrivalsForStopLine = getArrivalsForStopLine;