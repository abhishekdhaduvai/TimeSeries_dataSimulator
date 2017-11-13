var express = require('express');
var http = require('http'); 
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var WebSocket = require('ws');
var axios = require('axios');
var url = require('url');
var HttpsProxyAgent = require('https-proxy-agent');

var app = express();
var httpServer = http.createServer(app);

var node_env = process.env.node_env || 'development';
if(node_env === "development"){
  var devConfig = require('./localConfig.json')[node_env];
}

console.log("devConfig ",devConfig.uaaURL)

var proxy = process.env.http_proxy || '';
var uaaURL = process.env.uaaURL || devConfig.uaaURL;
var client_credentials = process.env.base64ClientCredential || devConfig.base64ClientCredential;
var timeOfLastToken = 0;
var tokenExpirationTime = 0;
var token = "";

function getToken() {
  if((Date.now()-timeOfLastToken)/1000 >= tokenExpirationTime){
    headers = {
      "Authorization":"Basic "+client_credentials
    }
    axios.get(uaaURL+"/oauth/token?grant_type=client_credentials", {headers})
    .then(res => {
      console.log("Getting a new token!")
      timeOfLastToken = Date.now();
      tokenExpirationTime = res.data.expires_in;
      token = res.data.access_token;
      sendData()
    })
    .catch(err => {
      console.log("There was an error in gettin the token :(");
    })
  }
  else {
    console.log("Using the existing token")
    sendData()
  }
}

getToken();
setInterval(function(){getToken()},30000);

function sendData(){  
  var data = {
    "token": token,
    "zoneId": process.env.timeSeriesZoneId || devConfig.timeseriesZoneId
  }
  console.log("Ingesting data");
  var endpoint = "wss://gateway-predix-data-services.run.aws-usw02-pr.ice.predix.io/v1/stream/messages";
  const ws = new WebSocket(endpoint,
    [],
    {
      'headers':{
       'predix-zone-id': data.zoneId,
       'content-type': 'application/json',
       'origin': '*',
       'authorization': 'Bearer '+data.token
      } 
    }
  );

  ws.on('error', function error(res){
    console.log("IN ERROR!!!!", res);
  })

  ws.on('open', function (){
    console.log("Websocket to Time Series opened!");
    max = process.env.maxTagNumber || 998;
    var payload = {
      "messageId": Date.now(),
      "body": [
        {
          "name": "Tag_"+Math.floor(Math.random() * max),
          "datapoints": [
            [
              Date.now(),
              Math.floor(Math.random() * 2),
              3
            ]
          ]
        }
      ]
    }
    console.log("payload ",JSON.stringify(payload));
    ws.send(JSON.stringify(payload));
    
  });

  ws.on('message', function(){
    
  })

  ws.on('unexpected-response', function(e){
    console.log("Unexpected Response",e);
  });
}

app.get("/", function(req, res){
  res.send("Welcome to the Data Simulator")
})

app.get("/token", function(req, res){
  res.send(token)
})

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

httpServer.listen(process.env.VCAP_APP_PORT || 5000, function () {
	console.log ('Server started on port: ' + httpServer.address().port);
});

module.exports = app;
