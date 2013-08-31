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
		var rawResponse = JSON.parse(JSON.stringify(req.operator.lines[req.params.line])); // clone object
		var response = {
			id: rawResponse.id
			, name: rawResponse.name
			, stops: []
		};
		// cleanup
		for (var s in rawResponse.stops) {
			var stop = rawResponse.stops[s];
			var connections = [];
			for (var l in rawResponse.stops[s].lines) {
				if (rawResponse.stops[s].lines[l].id != req.params.line) {
					delete rawResponse.stops[s].lines[l].url;
					connections.push(rawResponse.stops[s].lines[l]);
				}
			}
			stop.connections = connections;
			delete stop.lines;
			response.stops.push(stop);
		}
		response = {line: response};
	} else {
		var rawResponse = JSON.parse(JSON.stringify(req.operator.lines)); // clone object
		var response = [];
		// cleanup
		for (var i in rawResponse) {
			var stops = [];
			for (var s in rawResponse[i].stops) {
				var stop = rawResponse[i].stops[s];
				var connections = [];
				for (var l in rawResponse[i].stops[s].lines) {
					if (rawResponse[i].stops[s].lines[l].id != rawResponse[i].id) {
						delete rawResponse[i].stops[s].lines[l].url;
						connections.push(rawResponse[i].stops[s].lines[l]);
					}
				}
				stop.connections = connections;
				delete stop.lines;
				stops.push(stop);
			}
			rawResponse[i].stops = stops;
			response.push(rawResponse[i]);
		}
		response = {lines:response};
	}
	res.sendData(response);
};

var getStops = function(req, res) {
	if (req.params.stop) {
		var rawResponse = JSON.parse(JSON.stringify(req.operator.stops[req.params.stop])); // clone object

		var response = {
			id: rawResponse.id
			, name: rawResponse.name
			, connections: []
		};
		// cleanup
		for (var l in rawResponse.lines) {
			delete rawResponse.lines[l].url;
			response.connections.push(rawResponse.lines[l]);
		}
		response = {stop:response};
	} else {
		var rawResponse = JSON.parse(JSON.stringify(req.operator.stops)); // clone object
		var response = [];
		// cleanup
		for (var s in rawResponse) {
			var lines = [];
			for (var l in rawResponse[s].lines) {
				delete rawResponse[s].lines[l].url
				lines.push(rawResponse[s].lines[l]);
			}
			rawResponse[s].lines = lines;
			response.push(rawResponse[s]);
		}
		response = {stops:response};
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