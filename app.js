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

var express = require('express')
  , routes = require('./routes')
  , scrap = require('./routes/scrap')
  , api = require('./routes/api')
  , http = require('http')
  , path = require('path')
  , easyxml = require('easyxml')
  , fs = require('fs')
;

easyxml.configure({
  singularizeChildren: true,
  underscoreAttributes: true,
  rootElement: 'response',
  dateFormat: 'ISO',
  indent: 2,
  manifest: true
});

// load settings file
var settingsType = process.env.SETTINGS || 'default';
var settingsFile = __dirname + '/' + settingsType +'.settings.json';
var settings = require(settingsFile);

//load storage if exists
if (fs.existsSync('storage.json')) {
  var storage = require(__dirname + '/storage.json');
}

var app = express();

app.configure(function(){
  app.set('port', settings.port);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'hjs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.compress());
  app.use(express.methodOverride());
  app.use(express.bodyParser());
  app.use(function(req, res, next) {
    // content negociation handler
    res.sendData = function(obj,status_) {
      var status = status_ || 200;
      try {
        // TODO : this cause sometime an error «headers already sent» why ? the try catch fixes this…
        if ((req.accepts('json') && req.params.ext == undefined) || req.params.ext == 'json') {
          res.type('json').jsonp(status,obj);
        } else if ((req.accepts('application/xml') && req.params.ext == undefined) || req.params.ext == 'xml') {
          res.header('Content-Type', 'text/xml');
          var xml = easyxml.render(obj);
          res.type('xml').send(status,xml);
        } else {
          res.send(406,'You must set http header «Accepts» to «application/json» or «application/xml» or just put the .json or .xml extension at the end of the URL.');
        }
      } catch (e) {}
    };
    next();
  });
  app.use(app.router);
  app.use(require('less-middleware')({ src: __dirname + '/public' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.set('settings', settings);
  if (storage) app.set('storage', storage);

  // params validation
  app.param('operator', function(req, res, next, id) {
    if (storage[id]) {
      req.operator = storage[id];
      next();
    } else {
      var message = 'The operator \''+id+'\' does not exists. Here is a list of valid operators IDs.';
      var operators = [];
      for (var i in storage) {
        operators.push(i);
      }
      res.sendData({message: message, operators: operators},404);
    }
  });

  app.param('stop', function(req, res, next, id) {
    if (storage[req.params.operator].stops[id]) {
      next();
    } else {
      var message = 'The stop \''+id+'\' does not exists for operator \''+req.params.operator+'\'. Here is a list of valid stops IDs.';
      var stops = [];
      for (var i in storage[req.params.operator].stops) {
        stops.push(i);
      }
      res.sendData({message: message, stops: stops},404);
    }
  });

  app.param('line', function(req, res, next, id) {
    if (storage[req.params.operator].lines[id]) {
      if (req.params.stop) {
        console.log('a stop is specified.')
        // if a stop is also specified, check if the stop is on this line
        if (!Object.keys(storage[req.params.operator].stops[req.params.stop].lines).indexOf(id)) {
          next();
        } else {
          var message = 'The stop \''+req.params.stop+'\' is not part of line \''+id+'\'. Here the list of stops for this line ans lines for this stop.';
          var stops = [];
          for (var i in storage[req.params.operator].lines[id].stops) {
            stops.push(i);
          }
          var lines = [];
          for (var i in storage[req.params.operator].stops[req.params.stop].lines) {
            lines.push(i);
          }
          res.sendData({message: message, stopsForGivenLine: stops, linesForGivenStop: lines},404);
        }
      } else {
        next();
      }
    } else {
      var message = 'The line \''+id+'\' does not exists for operator \''+req.params.operator+'\'. Here is a list of valid lines IDs.';
      var lines = [];
      for (var i in storage[req.params.operator].lines) {
        lines.push(i);
      }
      res.sendData({message: message, lines: lines},404);
    }
  });  
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

// Routes
app.get('/', routes.index); // homepage
app.get('/scrap/'+settings.secret, scrap.scrap); // url to call to do the initial scrap
app.get('/viewStorage/'+settings.secret+'.:ext?$', scrap.viewStorage); // url to call to have a look to the whole storage

// Routes for REST API
app.get('/:operator/getLines.:ext?$', api.getLines); // get all infos for all lines
app.get('/:operator/getLine/:line.:ext?$', api.getLines); // get all infos for a line

app.get('/:operator/getStops.:ext?$', api.getStops); // get all infos for all stops
app.get('/:operator/getStop/:stop.:ext?$', api.getStops); // get all infos for a stop

app.get('/:operator/getArrivals/:stop/:line.:ext?$', api.getArrivalsForStopLine); // get the arrivals for a stop on a line
app.get('/:operator/getArrivals/:stop.:ext?$', api.getArrivalsAtStop); // get all the arrivals for a stop from all lines
app.get('/:operator/getArrivalsAtStop/:stop/forLine/:line.:ext?$', api.getArrivalsForStopLine); // same as above
app.get('/:operator/getArrivalsAtLine/:line/forStop/:stop.:ext?$', api.getArrivalsForStopLine); // same as above
app.get('/:operator/getArrivalsAtStop/:stop.:ext?$', api.getArrivalsAtStop); // get all arrvivals at a stop from all lines

// Create server
http.createServer(app).listen(app.get('port'), function(){
  console.log('apiMobitrans server listening on port ' + app.get('port'));
});
