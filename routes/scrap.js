var http = require('http')
  , cheerio = require('cheerio')
  , util = require('util')
  , urlUtil = require('url')
  , qs = require('querystring')
  , slug = require('slugg')
  , eventsMaster = require('events')
  , events = new eventsMaster.EventEmitter()
  , fs = require('fs')
;

var storage = {};

var settings = {};

function Operator(name) {
  this.name = name;
  this.sessionId = null;
  this.cookie = {
          name: null
          , value: null
        };
  this.linesUrl = null;
  this.stops = {};
  this.stopsLinks = [];
  this.stopsCount = 0;
  this.linesCount = 0;
  this.linesTemp = {};
  this.lines = {};
  this.linesScrapped = 0;
  this.scrapping = true;
}

Operator.prototype = {
  startScrapping: function() {
    var thisOperator = this;
    console.log(thisOperator.name + ' : Scrapping…');
    // 1. Getting session ID, cookies and the lile list url page
    http
      .request(
        {
          host: thisOperator.name + '.mobitrans.fr',
          headers: {'User-Agent': 'Mozilla/5.0'},
          path: '/index.php'
        }
        , function(res) {
          var body = '';
          res
            .on('data', function(chunk) {
              body += chunk;
            })
            .on('end', function(){
              // parsing and storing cookie
              var cookie_tmp = res.headers['set-cookie'][0];
              cookie_tmp = cookie_tmp.split(';');
              var cookie_tmp_nameval= cookie_tmp[0].split('=');
              thisOperator.cookie.name = cookie_tmp_nameval[0];
              thisOperator.cookie.value = cookie_tmp_nameval[1];
              // parsing and storing uri datas and the page url to retrieve lines list
              $ = cheerio.load(body);
              thisOperator.linesUrl = $('a').first().attr('href');
              var query = urlUtil.parse('/' + thisOperator.linesUrl, true, true).query;
              thisOperator.sessionId = query.I;
              console.log(thisOperator.name + ' : session OK. Url to discover the lines OK.\n');
              thisOperator.getLines();
            })
          ;
        }
      )
      .on('error', function(e) {
        console.log(thisOperator.name + ' : Got error: ' + e.message);
      })
      .end()
    ;
  }
  , getLines: function() {
    // 2. get all lines form operator
    var thisOperator = this;
    console.log(thisOperator.name + ' : Getting lines…\n ');
    http
      .request(
        {
          host: thisOperator.name + '.mobitrans.fr'
          , headers: {
            'Cookie': thisOperator.cookie.name + '=' + thisOperator.cookie.value
            , 'User-Agent': 'Mozilla/5.0'
          }
          , path: thisOperator.linesUrl
        }, function(res) {
          var body = '';
          res
            .on('data', function(chunk) {
              body += chunk;
            })
            .on('end', function(){
              // get operator lines from the dom select element
              $ = cheerio.load(body);
              thisOperator.linesCount = $('select[name="ligne"] option').length;
              $('select[name="ligne"] option').each(function(i,element){
                var line = {
                  id: element.attribs.value
                  , name: element.children[0].data
                  , stops: []
                };
                thisOperator.linesTemp[line.id] = line;
                console.log('\t' + thisOperator.name + ' : line «' + line.name + '» (id: ' + line.id + ') discovered.');
                if (Object.keys(thisOperator.linesTemp).length == thisOperator.linesCount) {
                  console.log(thisOperator.name + ' : ' + thisOperator.linesCount + ' lines listed.\n');
                  thisOperator.getStopsLinks();
                }
              });
            })
        })
      .on('error', function(e){
        console.log(thisOperator.name + ' : Got error: ' + e.message);
      })
      .end()
    ;
  }
  , getStopsLinks: function() {
    // 3. getting stops for each lines
    var thisOperator = this;
    console.log(thisOperator.name + ' : getting stops…\n');
    for (var id in thisOperator.linesTemp) {
      var postDatas = qs.stringify({
        ligne: id
        , p: 41
        , s_ligne: 'Valider'
        , I: thisOperator.sessionId
      });

      var post = http
        .request(
          {
            host: thisOperator.name + '.mobitrans.fr'
            , headers: {
              'Cookie': thisOperator.cookie.name + '=' + thisOperator.cookie.value
              , 'User-Agent': 'Mozilla/5.0'
              , 'Content-Type': 'application/x-www-form-urlencoded'
              , 'Content-Length': postDatas.length
            }
            , path: '/index.php'
            , method: 'POST'
            , 
          }
          , function(res){
            var body = '';
            res.setEncoding('binary');
            res
              .on('data', function(chunk) {
                body += chunk;
              })
              .on('end', function(){
                $ = cheerio.load(body);
                // get the line name
                if ($('.error').length > 0) {
                  // sometimes, the line does not exists… and have no stop list page, but only an .error element…
                  thisOperator.linesScrapped++;
                  if (Object.keys(thisOperator.linesTemp).length == thisOperator.linesScrapped) {
                    console.log('\n' + thisOperator.name + ' : all stops found.\n');
                    thisOperator.storeDatas();
                  }
                  return;
                }

                var lineName = $('div.corpsL span').slice(1).eq(0).text();
                var lineId = $('a.endPage').attr('href');
                var query = urlUtil.parse('/' + lineId, true, true).query;
                lineId = query.ligne;

                var stopsCount = $('a.white').length; // stops for the current line
                console.log('\t' + thisOperator.name + ' : ' + stopsCount +' stops found for line «'+lineName+'».');

                var stopsScraped = 0;
                $('a.white').each(function(iterator, element) {
                  var stopName = $(this).text().replace(/( T[1234])$/,'');
                  thisOperator.linesTemp[lineId].stops.push({
                    name: stopName
                    , url: $(this).attr('href')
                  });
                  stopsScraped++;
                  if (stopsScraped == stopsCount)
                    thisOperator.linesScrapped++;
                  if (Object.keys(thisOperator.linesTemp).length == thisOperator.linesScrapped) {
                    console.log('\n' + thisOperator.name + ' : all stops found.\n');
                    thisOperator.storeDatas();
                  }
                });
              })
            ;
        })
        .on('error', function(e){
          console.log(thisOperator.name + ' : Got error: ' + e.message);
        })
      ;
      post.write(postDatas);
      post.end();
    }
  }
  , storeDatas: function() {
    // 3. getting stops for each lines
    var thisOperator = this;
    for (var l in thisOperator.linesTemp) {
      var line = thisOperator.linesTemp[l];

      thisOperator.lines['line_' + slug(line.id)] = {
        id: slug(line.id)
        , name: line.name
        , stops: {}
      };

      for (var s in line.stops) {
        var stop = line.stops[s];

        var query = qs.parse(stop.url);

        var stopSlug = 'stop_' + slug(stop.name.trim().toLowerCase())

        if (stop.name!='..') {
          // if the stop really exists…
          if (thisOperator.stops[stopSlug]) {
            // the stops has already been seen, its a junction between two lines
            thisOperator.stops[stopSlug].lines['line_' + slug(line.id)] = {
              id: 'line_' + slug(line.id)
              , name: line.name
              , url: {
                p: 49
                , id: query.id
                , rd: query.rd
              }
            };
          } else {
            // first time this stop is seen, create it
            var stopToStore = {
              name: stop.name
              , id: stopSlug
              , lines: {}
            }
            // add the line to this stop
            stopToStore.lines['line_' + slug(line.id)] = {
              id: 'line_' + slug(line.id)
              , name: line.name
              , url: {
                p: 49
                , id: query.id
                , rd: query.rd
              }
            };
          }
          // Store the stop in the general stop list and the line
          thisOperator.stops[stopToStore.id] = stopToStore;
          thisOperator.lines['line_' + slug(line.id)].stops[stopSlug] = stopToStore;
        }
      }
    }
    thisOperator.stopsLinks = [];
    thisOperator.linesTemp = {};
    console.log(thisOperator.name+' : Finished ! \n');
    thisOperator.scrapping = false;
    events.emit('finish');
  }
}

/* routes */
var scrap = function(req, res) {
  var d = new Date();
  var start = d.valueOf();
  settings = req.app.settings.settings;
  console.log('Init Storage');
  for (operator in settings.operators) {
    console.log('init «'+settings.operators[operator]+'»');
    storage[settings.operators[operator]] = new Operator(settings.operators[operator]);
    storage[settings.operators[operator]].startScrapping();
  }
  events.on('finish', function() {
    for (var operator in storage) {
      //waiting for all processes to finish
      if (storage[operator].scrapping) return;
    }
    var d = new Date();
    var end = d.valueOf();
    var diff = end - start;
    var duration = diff/1000;
    console.log('\n All finished ! \\o/');

    fs.writeFileSync('storage.json', JSON.stringify(storage));

    req.app.set('storage', storage);
    res.send(200,'<html><body style="font-family:sans-serif;text-align:center">'
                +'Scrap done in '+duration+' seconds.<br><br>'
                +'You can check the scrapped datas in <a href="../../viewStorage/'+settings.secret+'.json">JSON</a> or <a href="../../viewStorage/'+settings.secret+'.xml">XML</a><br>'
                +'Enjoy.</body></html>');
  });
}

var viewStorage = function(req, res) {
  res.status(200).sendData(req.app.get('storage'));
}

exports.storage = storage;
exports.scrap = scrap;
exports.viewStorage = viewStorage;
