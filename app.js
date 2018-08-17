var _ = require('lodash');
var logger = require('./lib/utils/logger');
var chalk = require('chalk');
var http = require('http');
var fs = require('fs');
var WebSocket = require('ws');
var exec = require('child_process').exec;

// use mainnet by default
var env = process.env.NODE_ENV || "production";
var config = require('./lib/utils/config.json')[env];

var rpc_cert = fs.readFileSync(config.cert_path);
var rpc_user = config.user;
var rpc_password = config.pass;

var app = require('./lib/express');
server = http.createServer(app);

// Init socket vars
var Primus = require('primus');
var api;
var client;
var server;

// Init Client Socket connection
client = new Primus(server, {
	transformer: 'websockets',
	pathname: '/primus',
	parser: 'JSON'
});

client.use('emit', require('primus-emit'));

// Init collections
var Collection = require('./lib/collection');
var Nodes = new Collection();
Nodes.add( {id : 'localhost'}, function (err, info)
{
	if (err) console.log(err);
});

Nodes.setChartsCallback(function (err, charts)
{
	if(err !== null)
	{
		console.error('COL', 'CHR', 'Charts error:', err);
	}
	else
	{
		client.write({
			action: 'charts',
			data: charts
		});
	}
});

// reconnect interval = 5 seconds
var reconnectInterval = 5 * 1000;
var reconnecting = false;
var ws;
// Initiate the websocket connection.  The dcrd generated certificate acts as
// its own certificate authority, so it needs to be specified in the 'ca' array
// for the certificate to properly validate.
var connect = function() {
	reconnecting = false;
	console.log('Connecting to Hcd daemon');
	ws = new WebSocket('wss://'+config.host+':'+config.port+'/ws', {
	  headers: {
	    'Authorization': 'Basic '+new Buffer(rpc_user+':'+rpc_password).toString('base64')
	  },
	  cert: rpc_cert,
	  ca: [rpc_cert]
	});

	ws.on('open', function() {
	    console.log('CONNECTED');
	    // Send a JSON-RPC command to be notified when blocks are connected and
	    // disconnected from the chain.
	    ws.send('{"jsonrpc":"1.0","id":"notifyblocks","method":"notifyblocks","params":[]}', function(err) {
				if (err) {
					console.log('Socket error: ' + err);
				}
			});

		// gets block info on restart, not only on new blocks
                ws.send('{"jsonrpc":"1.0","id":"getbestblockhash","method":"getbestblockhash","params":[]}', function(err) {
				if (err) {
					console.log('Socket error: ' + err);
				}
			});

	    /* Update stuff each minute */
	    var activeNodesInterval = setInterval(function() {
	    	ws.send('{"jsonrpc":"1.0","id":"getpeerinfo","method":"getpeerinfo","params":[]}', function(err) {
					if (err) {
						console.log('Socket error: ' + err);
					}
				});
	  		ws.send('{"jsonrpc":"1.0","id":"ticketsmempool","method":"getrawmempool","params":[false, "tickets"]}', function(err) {
					if (err) {
						console.log('Socket error: ' + err);
					}
				});
				//dcrctl getrawmempool false tickets
//	  		ws.send('{"jsonrpc":"1.0","id":"getstakeinfo","method":"getstakeinfo","params":[]}', function(err) {
//					if (err) {
//						console.log('Socket error: ' + err);
//					}
//				});
	  		ws.send('{"jsonrpc":"1.0","id":"getmininginfo","method":"getmininginfo","params":[]}', function(err) {
					if (err) {
						console.log('Socket error: ' + err);
					}
				});
	  		ws.send('{"jsonrpc":"1.0","id":"estimatestakediff","method":"estimatestakediff","params":[]}', function(err) {
					if (err) {
						console.log('Socket error: ' + err);
					}
				});
	  	}, 60000);

	  	// except for getticketpoolvalue which eats a huge amount of CPU, so run it less frequently.
	  //   var activeNodesInterval = setInterval(function() {
			// ws.send('{"jsonrpc":"1.0","id":"getticketpoolvalue","method":"getticketpoolvalue","params":[]}', function(err) {
			// 		if (err) {
			// 			console.log('Socket error: ' + err);
			// 		}
			// 	});
	  // 	}, 5 * 60000);

	});

	ws.on('message', function(data, flags) {

	    try {
	    	data = JSON.parse(data);
	    } catch(e) {
	    	console.log(e);
	    	return;
	    }
	    /* Get New Block by hash */
	    if (data.params) {
	      ws.send('{"jsonrpc":"1.0","id":"getbestblockhash","method":"getbestblockhash","params":[]}', function(err) {
					if (err) {
						console.log('Socket error: ' + err);
					}
				});
	    	return;
	    }

		var result = data.result;

		if (result && data.id && data.id == 'getbestblockhash') {
			// requests last block
                  ws.send('{"jsonrpc":"1.0","id":"getblock","method":"getblock","params":["'+result+'"]}', function(err) {
					if (err) {
						console.log('Socket error: ' + err);
					}
				});
		} else if (result && data.id && data.id == 'getblock') {
	      addNewBlock(result);
		} else if (result && data.id && data.id == 'getmininginfo') {
	      updateNetworkHashrate(result);
		} else if (result && data.id && data.id == 'getstakeinfo') {
		    updateStake(result);
		} else if (result && data.id && data.id == 'ticketsmempool') {
		    updateTicketsMempool(result);
		} else if (result && data.id && data.id == 'estimatestakediff') {
	      updateEstimateStake(result);
		} else if (result && data.id && data.id == 'getpeerinfo') {
	      updatePeerInfo(result);
	    } else if ( result && data.id && data.id == 'getcoinsupply' ) {
	      updateSupply(result);
	    } else if (result && data.id && data.id == 'getticketpoolvalue' ) {
	      updateLocked(result);
	    }
	});
	ws.on('error', function(derp) {
	  console.log('ERROR:' + derp);
		if (!reconnecting) {
			console.log('Trying to reconnect.');
			reconnecting = true;
			setTimeout(connect, reconnectInterval);
		}
	});
	ws.on('close', function(data) {
	  console.log('DISCONNECTED');
		if (!reconnecting) {
			console.log('Trying to reconnect.');
			reconnecting = true;
			setTimeout(connect, reconnectInterval);
		}
	});
};

/* Connect to hcd daemon on start */
connect();

client.on('connection', function (clientSpark)
{
	clientSpark.on('ready', function (data)
	{
		clientSpark.emit('init', { nodes: Nodes.all() });

		Nodes.getCharts();
    client.write({ action: 'peers', data: {peers : Nodes.peers()} });
	});

	clientSpark.on('client-pong', function (data)
	{
		var serverTime = _.get(data, "serverTime", 0);
		var latency = Math.ceil( (_.now() - serverTime) / 2 );

		clientSpark.emit('client-latency', { latency: latency });
	});
});

var latencyTimeout = setInterval( function ()
{
	client.write({
		action: 'client-ping',
		data: {
			serverTime: _.now()
		}
	});
}, 5000);

// Cleanup old inactive nodes
var nodeCleanupTimeout = setInterval( function ()
{
	client.write({
		action: 'init',
		data: Nodes.all()
	});

	Nodes.getCharts();

}, 1000*60*60);

function addNewBlock (block) {
    Nodes.addBlock('localhost', block, function (err, stats)
    {
      if(err !== null)
      {
        console.error('API', 'BLK', 'Block error:', err);
      }
      else
      {
        if(stats !== null)
        {
          client.write({
            action: 'block',
            data: stats
          });

          console.success('API', 'BLK', 'Block:', block['height']);

          Nodes.getCharts();
        }
      }
    });

    /* Update coin supply */
    ws.send('{"jsonrpc":"1.0","id":"getcoinsupply","method":"getcoinsupply","params":[]}', function(err) {
			if (err) {
				console.log('Socket error: ' + err);
			}
		});
	// I might want to update getticketpoolvalue when i get a new block too
	ws.send('{"jsonrpc":"1.0","id":"getticketpoolvalue","method":"getticketpoolvalue","params":[]}', function(err) {
			if (err) {
				console.log('Socket error: ' + err);
			}
		});

}

function updateSupply (data) {
  Nodes.updateSupply(data, function (err, stats) {
    if(err !== null)
    {
      console.error('API', 'UPD', 'updateSupply error:', err);
    } else {
      console.success('API', 'UPD', 'Updated availiable supply');
      return;
    }
  });
}

function updateLocked (data) {
  Nodes.updateLocked(data, function (err, stats) {
    if(err !== null)
    {
      console.error('API', 'UPD', 'updateLocked error:', err);
    } else {
      console.success('API', 'UPD', 'Updated locked coins');
      return;
    }
  });
}

function updatePeerInfo(data) {
  Nodes.updatePeers(data, function(err, peers) {
    if (err) {
      console.log(err);
    } else {
      console.success('API', 'UPD', 'Updated peers');
    }
    client.write({ action: 'peers', data: {peers : Nodes.peers()} });
  });
}

function updateNetworkHashrate (data) {
  Nodes.updateMiningInfo(data, function (err, stats) {
    if(err !== null)
    {
      console.error('API', 'BLK', 'MiningInfo error:', err);
    } else {
      console.success('API', 'UPD', 'Updated mininginfo');
      client.write({
        action: 'mininginfo',
        data: stats
      });
    }
  });
}

function updateTicketsMempool (data) {
  Nodes.updateTicketsMempool(data, function (err, stats) {
    if(err !== null)
    {
      console.error('API', 'BLK', 'TicketsMempool error:', err);
    } else {
      console.success('API', 'UPD', 'Updated TicketsMempool info');
      client.write({
        action: 'tiketsmempool',
        data: stats
      });
    }
  });
}

function updateStake (data) {
  Nodes.updateStakeInfo(data, function (err, stats) {
    if(err !== null)
    {
      console.error('API', 'BLK', 'StakeInfo error:', err);
    } else {
      console.success('API', 'UPD', 'Updated stake info');
      client.write({
        action: 'stakeinfo',
        data: stats
      });
    }
  });
}

function updateEstimateStake (data) {
  Nodes.updateEstimateStake(data, function (err, stats) {
    if(err !== null)
    {
      console.error('API', 'BLK', 'EstimateStake error:', err);
    } else {
      console.success('API', 'UPD', 'EstimateStake fee info');
      client.write({
        action: 'estimatestakediff',
        data: stats
      });
    }
  });
}

server.listen(process.env.PORT || 3000);

module.exports = server;
