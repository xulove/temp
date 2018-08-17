
/* Controllers */

netStatsApp.controller('StatsCtrl', function($scope, $filter, $localStorage, socket, _, toastr) {

	var MAX_BINS = 40;
	var BLOCK_REWARD = 31.19582664;

	// Main Stats init
	// ---------------

	$scope.frontierHash = '000000000000437482b6d47f82f374cde539440ddb108b0a76886f0d87d126b9';
	$scope.nodesTotal = 0;
	$scope.nodesActive = 0;
	$scope.bestBlock = 0;
	$scope.lastBlock = 0;
	$scope.lastDifficulty = 0;
	$scope.upTimeTotal = 0;
	$scope.avgBlockTime = 0;
	$scope.blockPropagationAvg = 0;
	$scope.avgHashrate = 0;
	$scope.pooledtx = 0;
	$scope.supply = 0;
	$scope.locked = 0;
	$scope.blockReward = BLOCK_REWARD;
	$scope.stakeReward = BLOCK_REWARD * 0.06;
	$scope.bestStats = {};
	$scope.poolsize = 0;
	$scope.allmempooltix = 0;
	$scope.estimatemin = 0;
	$scope.estimatemax = 0;
	$scope.estimateexpected = 0;

	//$scope.lastGasLimit = _.fill(Array(MAX_BINS), 2);
	$scope.lastBlocksTime = _.fill(Array(MAX_BINS), 2);
	$scope.freshstakeChart = _.fill(Array(MAX_BINS), 2);
	$scope.votersChart = _.fill(Array(MAX_BINS), 2);
	$scope.transactionDensity = _.fill(Array(MAX_BINS), 2);
	//$scope.gasSpending = _.fill(Array(MAX_BINS), 2);
	$scope.miners = [];


	$scope.nodes = [];
	$scope.peers = [];
	$scope.map = [];
	$scope.blockPropagationChart = [];
	//$scope.uncleCountChart = _.fill(Array(MAX_BINS), 2);
	$scope.coinbases = [];

	$scope.latency = 0;

	$scope.currentApiVersion = "0.1.0";

	$scope.predicate = $localStorage.predicate || ['-pinned', '-stats.active', '-stats.block.height', 'stats.block.propagation'];
	$scope.reverse = $localStorage.reverse || false;
	$scope.pinned = $localStorage.pinned || [];

	$scope.prefixPredicate = ['-pinned', '-stats.active'];
	$scope.originalPredicate = ['-stats.block.height', 'stats.block.propagation'];

	$scope.orderTable = function(predicate, reverse)
	{
		if(!_.isEqual(predicate, $scope.originalPredicate))
		{
			$scope.reverse = reverse;
			$scope.originalPredicate = predicate;
			$scope.predicate = _.union($scope.prefixPredicate, predicate);
		}
		else
		{
			$scope.reverse = !$scope.reverse;

			if($scope.reverse === true){
				_.forEach(predicate, function (value, key) {
					predicate[key] = (value[0] === '-' ? value.replace('-', '') : '-' + value);
				});
			}

			$scope.predicate = _.union($scope.prefixPredicate, predicate);
		}

		$localStorage.predicate = $scope.predicate;
		$localStorage.reverse = $scope.reverse;
	}


	var timeout = setInterval(function ()
	{
		$scope.$apply();
	}, 300);

	$scope.getNumber = function (num) {
		return new Array(num);
	}

	// Socket listeners
	// ----------------

	socket.on('open', function open() {
		socket.emit('ready');
		console.log('The connection has been opened.');
	})
	.on('end', function end() {
		console.log('Socket connection ended.')
	})
	.on('error', function error(err) {
		console.log(err);
	})
	.on('reconnecting', function reconnecting(opts) {
		console.log('We are scheduling a reconnect operation', opts);
	})
	.on('data', function incoming(data) {
		$scope.$apply(socketAction(data.action, data.data));
	});

	socket.on('init', function(data)
	{
		$scope.$apply(socketAction("init", data.nodes));
	});

	socket.on('client-latency', function(data)
	{
		$scope.latency = data.latency;
	})

	function socketAction(action, data)
	{
		// filter data
		data = xssFilter(data);

		// console.log('Action: ', action);
		// console.log('Data: ', data);

		switch(action)
		{
			case "init":
				$scope.nodes = data;

				_.forEach($scope.nodes, function (node, index) {

					latencyFilter(node);

					$scope.blockReward = getBlockReward(Math.ceil(node.stats.block.height / 6144) - 1, BLOCK_REWARD);
					$scope.stakeReward = ($scope.blockReward) * 0.06;
				});

				if( $scope.nodes.length > 0 )
				{
					toastr['success']("Got nodes list", "Got nodes!");

					updateBestBlock();
				}

				break;

			case "peers":

				$scope.peers = data.peers;
				$scope.map = _.map($scope.peers, function (peer) {
					// var fill = $filter('bubbleClass')(peer.stats, $scope.bestBlock);

					if(peer.geo != null)
						return {
							radius: 3,
							latitude: peer.geo.ll[0],
							longitude: peer.geo.ll[1],
							nodeName: peer.geo.city ? peer.geo.city + ", " + peer.geo.country : peer.addr + ", " + peer.geo.country ,
							fillClass: "text-success",
							fillKey: "success",
						};
					else
						return {
							radius: 0,
							latitude: 0,
							longitude: 0
						};
				});

				break;

			case "block":
				var index = findIndex({id: data.id});

				if( index >= 0 && !_.isUndefined($scope.nodes[index]) && !_.isUndefined($scope.nodes[index].stats) )
				{
					if( $scope.nodes[index].stats.block.height < data.block.height )
					{
						var best = _.max($scope.nodes, function (node) {
							return parseInt(node.stats.block.height);
						}).stats.block;

						if (data.block.height > best.height) {
							data.block.arrived = _.now();
						} else {
							data.block.arrived = best.arrived;
						}

						$scope.nodes[index].history = data.history;
					}

					$scope.nodes[index].stats.block = data.block;
					$scope.nodes[index].stats.propagationAvg = data.propagationAvg;
					$scope.blockReward = getBlockReward(Math.ceil(data.block.height / 6144) - 1, BLOCK_REWARD);
					$scope.stakeReward = ($scope.blockReward) * 0.06;
					$scope.poolsize = data.poolsize;

					updateBestBlock();
				}

				break;

			case "pending":
				var index = findIndex({id: data.id});

				if( !_.isUndefined(data.id) && index >= 0 )
				{
					var node = $scope.nodes[index];

					if( !_.isUndefined(node) && !_.isUndefined(node.stats.pending) && !_.isUndefined(data.pending) )
						$scope.nodes[index].stats.pending = data.pending;
				}

				break;

			case "stats":
				var index = findIndex({id: data.id});

				if( !_.isUndefined(data.id) && index >= 0 )
				{
					var node = $scope.nodes[index];

					if( !_.isUndefined(node) && !_.isUndefined(node.stats) )
					{
						$scope.nodes[index].stats.active = data.stats.active;
						$scope.nodes[index].stats.mining = data.stats.mining;
						$scope.nodes[index].stats.hashrate = data.stats.hashrate;
						$scope.nodes[index].stats.peers = data.stats.peers;
						$scope.nodes[index].stats.uptime = data.stats.uptime;

						if( !_.isUndefined(data.stats.latency) && _.get($scope.nodes[index], 'stats.latency', 0) !== data.stats.latency )
						{
							$scope.nodes[index].stats.latency = data.stats.latency;

							latencyFilter($scope.nodes[index]);
						}

						updateBestBlock();
					}
				}

				break;

			case "info":
				var index = findIndex({id: data.id});

				if( index >= 0 )
				{
					$scope.nodes[index].info = data.info;

					if( _.isUndefined($scope.nodes[index].pinned) )
						$scope.nodes[index].pinned = false;

					// Init latency
					latencyFilter($scope.nodes[index]);

					updateBestBlock();
				}

				break;

			case "mininginfo":
				console.log(data.networkhashps);
				$scope.avgHashrate = data.networkhashps;
				$scope.pooledtx = data.pooledtx;

				break;
				
			case "tiketsmempool":
				$scope.allmempooltix = data.allmempooltix;

				break;

			case "estimatestakediff":
				$scope.estimatemin = data.min;
				$scope.estimatemax = data.max;
				$scope.estimateexpected = data.expected;
				
				break;

			case "charts":

				if( !_.isEqual($scope.avgBlockTime, data.avgBlocktime) )
					$scope.avgBlockTime = data.avgBlocktime;

				if( !_.isEqual($scope.avgHashrate, data.avgHashrate) )
					$scope.avgHashrate = data.avgHashrate;
				console.log(data.avgHashrate);
				console.log(data.networkhashps);


				if( !_.isEqual($scope.lastBlocksTime, data.blocktime) && data.blocktime.length >= MAX_BINS ) 
					$scope.lastBlocksTime = data.blocktime;

				if( !_.isEqual($scope.freshstakeChart, data.freshstake) && data.freshstake.length >= MAX_BINS )
					$scope.freshstakeChart = data.freshstake;

				if( !_.isEqual($scope.votersChart, data.voters) && data.voters.length >= MAX_BINS )
					$scope.votersChart = data.voters;

				$scope.supply = Math.round(data.supply / 100000000).toString().replace(/(\d)(?=(\d\d\d)+([^\d]|$))/g, '$1 ');
				$scope.locked = Math.round(data.locked).toString().replace(/(\d)(?=(\d\d\d)+([^\d]|$))/g, '$1 ');
				$scope.pooledtx = data.pooledtx;

				if( !_.isEqual($scope.transactionDensity, data.transactions) && data.transactions.length >= MAX_BINS )
					$scope.transactionDensity = data.transactions;

				var bestHeight = _.max($scope.nodes, function (node)
				{
					return parseInt(node.stats.block.height);
				}).stats.block.height;

				$scope.blockReward = getBlockReward(Math.ceil(bestHeight / 6144) - 1, BLOCK_REWARD);
				$scope.stakeReward = ($scope.blockReward) * 0.06;
				
				// stake info
				$scope.poolsize = data.poolsize;
				var lastPoolsize = data.poolsize.slice(-1)[0];
				$scope.printablePoolSize = Math.round(lastPoolsize).toString().replace(/(\d)(?=(\d\d\d)+([^\d]|$))/g, '$1 ');
				$scope.allmempooltix = data.allmempooltix;
				$scope.estimatemin = data.estimatemin;
				$scope.estimatemax = data.estimatemax;
				$scope.estimateexpected = data.estimateexpected;
				$scope.avgTicketPrice = data.locked / lastPoolsize;
				

				break;

			case "inactive":
				var index = findIndex({id: data.id});

				if( index >= 0 )
				{
					if( !_.isUndefined(data.stats) )
						$scope.nodes[index].stats = data.stats;

					// toastr['error']("Node "+ $scope.nodes[index].info.name +" went away!", "Node connection was lost!");

					updateBestBlock();
				}

				break;

			case "latency":
				if( !_.isUndefined(data.id) && !_.isUndefined(data.latency) )
				{
					var index = findIndex({id: data.id});

					if( index >= 0 )
					{
						var node = $scope.nodes[index];

						if( !_.isUndefined(node) && !_.isUndefined(node.stats) && !_.isUndefined(node.stats.latency) && node.stats.latency !== data.latency )
						{
							node.stats.latency = data.latency;
							latencyFilter(node);
						}
					}
				}

				break;

			case "client-ping":
				socket.emit('client-pong', {
					serverTime: data.serverTime,
					clientTime: _.now()
				});

				break;
		}

		// $scope.$apply();
	}

	function findIndex(search)
	{
		return _.findIndex($scope.nodes, search);
	}

	function getMinersNames()
	{
		if( $scope.miners.length > 0 )
		{
			_.forIn($scope.miners, function (value, key)
			{
				if(value.name !== false)
					return;

				if(value.miner === "0x0000000000000000000000000000000000000000")
					return;

				var name = _.result(_.find(_.pluck($scope.nodes, 'info'), 'coinbase', value.miner), 'name');

				if( !_.isUndefined(name) )
					$scope.miners[key].name = name;
			});
		}
	}

	function updateBestBlock()
	{
		if( $scope.nodes.length )
		{
			var chains = {};
			var maxScore = 0;

			var bestBlock = _.max($scope.nodes, function (node)
			{
					return parseInt(node.stats.block.height);
			}).stats.block.height;

			if( bestBlock !== $scope.bestBlock )
			{
				$scope.bestBlock = bestBlock;
				$scope.bestStats = _.max($scope.nodes, function (node) {
					return parseInt(node.stats.block.height);
				}).stats;

				$scope.lastBlock = $scope.bestStats.block.arrived;
				$scope.lastDifficulty = $scope.bestStats.block.difficulty;
				$scope.lastDifficulty = $scope.bestStats.block.difficulty;
			}
		}
	}

	function getBlockReward(cycles, reward) {
		if (cycles <= 0) return reward;
	  if (cycles) {
	    reward = reward * 100/101;
	    return getBlockReward(cycles - 1, reward);
	  } else {
	    return reward;
	  }
	}

	function latencyFilter(node)
	{
		if( _.isUndefined(node.readable) )
			node.readable = {};

		if( _.isUndefined(node.stats) ) {
			node.readable.latencyClass = 'text-danger';
			node.readable.latency = 'offline';
		}

		if (node.stats.active === false)
		{
			node.readable.latencyClass = 'text-danger';
			node.readable.latency = 'offline';
		}
		else
		{
			if (node.stats.latency <= 100)
				node.readable.latencyClass = 'text-success';

			if (node.stats.latency > 100 && node.stats.latency <= 1000)
				node.readable.latencyClass = 'text-warning';

			if (node.stats.latency > 1000)
				node.readable.latencyClass = 'text-danger';

			node.readable.latency = node.stats.latency + ' ms';
		}
	}

	// very simple xss filter
	function xssFilter(obj){
		if(_.isArray(obj)) {
			return _.map(obj, xssFilter);

		} else if(_.isObject(obj)) {
			return _.mapValues(obj, xssFilter);

		} else if(_.isString(obj)) {
			return obj.replace(/\< *\/* *script *>*/gi,'').replace(/javascript/gi,'');
		} else
			return obj;
	}
});