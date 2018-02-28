var request = require('request');
const crypto = require('crypto');
var Promise = require("bluebird");

///General
var baseUrl = 'https://www.binance.com';
var red = "\x1b[31m";
var green = "\x1b[32m";
var blue = "\x1b[34m";
var white = "\x1b[37m";
var yellow  = "\x1b[33m";
var magenta = "\x1b[35m";

//Personal
var apiKey = '';
var secret = '';

//Customizable logic

/*
    Interval of candles
    This is and value that really
    is worht of expermementing with
    Enums:

        1m
        3m
        5m
        15m
        30m
        1h
        2h
        4h
        6h
        8h

        //default 15m

        Note: this this wil dramanticly affect
        when to engage to sell and enter buy mode
        Longer intervals will ensure you are in a
        big drop thus ensuring more safe profit but profit will
        only occur during extreme conseuqnet dips
        shorter timeframe is better for more flucutant market

 */
var candlesInterval = '15m';

/*
    How many candles should be checked
 */
var candlesToCheck = 10;

/*
    How many detailed candles should be checked
 */
var candlesDetailedToCheck = 5;

/*
    How many candles can be positive?
    If there are less green candles then this it will sell
    Should be less then CandlesToCheck
 */
var maximumCandlesPositive = 3;

/*
    How many candles can be positive?
    If there are less green candles then this it will sell
    Should be less then CandlesToCheck
 */
var maximumDetailedCandlesPositive = 2;

/*
    If the last x candles are heavy drops
    we allow x amount extra positive candles
 */
var maximumCandlesPositiveExtraForDrop = 1;

/*
    What is considered an heavy drop
 */
var heavyDropPercentage = -1.25;

/*
    How many candles should be displayed on screen
 */
var displayAmountOfCandles = 30;

/*
    How many candles should be displayed on screen
 */
var displayAmountOfDetailedCandles = 10;

/*
    How much should you sell per transaction
    Higher is better
 */
var sellQuantity = 250;

/*
    How much VEN profit should be made per transaction
    1 is default and safest
 */
var profitQuantity = 1;

/*
    Binance fee per transaction
    1.005 = 0.050%
 */
var $binanceFeeFactor = 1.005;

/*
    When is the bot allowed to make profit again
    after an succesfull buy order?
    In minutes
 */
var makeProfitAgainInterval = 30;

/*
    Minimum percentage of drop to buy on
 */
var minimumBuyPercentage = -0.55;

//Logic
var serverTimeOffset = 0;
var candles = [];
var sold = false;
var balanceFreeBtc = 0;
var balanceLockedBtc = 0;
var balanceFree = 0;
var balanceLocked = 0;
var venPrice = 0;
var btcPrice = 0;
var venUsdtPrice = 0;
var venUsdtPriceLast = 0;
var activeOrderId = null;
var activeOrderPending = false;
var buyback = false;
var buying = false;
var madeBuyOrderDate = null;
var lastStillNeeded = 0;
var performingDetailedAnalysis = false;


init();

setInterval(sellModeTick, 3000);
setInterval(buyModeTick, 1000);
setInterval(getServerTimeOffset, 60000);

function init() {

    console.log('Init...');
    console.log('');
    getServerTimeOffset();
    setTimeout(getAllOrders, 3000);
    setTimeout(get24hrChange, 5000);
    setTimeout(priceTick, 7000);
    setTimeout(getAccountBalance, 9000);
    setTimeout(cancelAllOpenPartialOrders, 11000);
    console.log('Booted..')
    console.log("\x1b[0m", '');
}


function sellModeTick() {

    if (!sold) {
        getCandleSticks();
    }
}

function buyModeTick() {

    if (sold) {

        priceTick();
        getAccountBalance();

        if (activeOrderPending === true) {

            //Check if order is completed
            getActiveOrderStatus();
        } else {

            checkToBuy();
            checkToBuyBack();
        }
    }
}

function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

function checkToBuyBack() {

    if (balanceFreeBtc === 0) {
        return;
    }

    //Allow 80% coin loss thereshold
    if (balanceFreeBtc <= Number(venPrice * Number(sellQuantity - 0.8).toFixed(12)).toFixed(12)) {

        console.log(magenta, '================================================================');
        console.log(magenta, bailOutReasons[getRandomInt(bailOutReasons.length)]);
        console.log(magenta, '================================================================');
        console.log("\x1b[0m", '');

        buyback = true;
        buy((sellQuantity - 1));
    }
}

function checkToBuy() {

    if (balanceFreeBtc === 0) {
        return;
    }

    console.log(magenta, 'Checking if bot should buy..');

    //Calcualte total price to buy
    var totalPriceToBuy = Number((sellQuantity + profitQuantity) * venPrice).toFixed(12);
    var balance = balanceFreeBtc;
    //Calculate still needed amount
    var stillNeeded = Number(totalPriceToBuy - balance).toFixed(10);


    console.log(magenta, (sellQuantity + profitQuantity) + ' VEN costs : ' + totalPriceToBuy);
    console.log(magenta, 'BTC balance: ' + balance);
    console.log(magenta, 'Still needed: ' + stillNeeded);

    if (stillNeeded < lastStillNeeded) {
        console.log(red, 'Warmer..');
    }
    if (stillNeeded > lastStillNeeded) {
        console.log(blue, 'Colder..');
    }
    console.log("\x1b[0m", '');

    lastStillNeeded = stillNeeded;

    //If we can buy
    if (balance >= totalPriceToBuy) {

        if (!buying) {

            buyback = false;
            buy((sellQuantity + profitQuantity));
        }
    } else {
        console.log('Not yet buying...')
    }
}


function getCandleSticks(time) {

    //default 1 minute candle
    if (!time) {
        time = candlesInterval;
    }

    if (performingDetailedAnalysis === true) {
        return;
    }

    console.log("\x1b[36m", 'Retrieving ' + candlesInterval + ' candle stick data:');

    var options = {
        url: baseUrl + '/api/v1/klines?symbol=VENBTC&interval=' + time,
        method: 'GET',
        headers: {
            "Content-Type": "application/json"
        },
        body: ''
    };
    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            var result = JSON.parse(body);

            for (var i = result.length - displayAmountOfCandles; i < result.length; i++) {

                if (result[i] !== null) {

                    var openTime = result[i][0];
                    var open = parseFloat(result[i][1]).toFixed(14);
                    var close = parseFloat(result[i][4]).toFixed(14);
                    var closeTime = result[i][6];
                    var closeDate = new Date(closeTime + 3600000).toTimeString();

                    var difference = Number(close - open).toFixed(10);
                    var percentage = Number((close / open) * 100).toFixed(4);
                    var plusIndicator = (difference >= 0) ? '+' : '';

                    var candle = {
                        "openTime": openTime,
                        "open": open,
                        "close": close,
                        "closeTime": closeTime,
                        "result": difference,
                        "percentage": percentage
                    };

                    var color = (close >= open) ? green : red;

                    if (i === (result.length - candlesToCheck)) {
                        console.log('==> ');
                    }

                    //Log result
                    console.log(color, 'Open: ' + Number(open).toFixed(10) + ' | Close: ' + Number(close).toFixed(10) + ' | Difference: ' + plusIndicator + '' + difference + ' | Percentage: ' + plusIndicator + '' + Number(percentage - 100).toFixed(6) + '%' + ' | Time: ' + closeDate);

                    candles.push(candle);
                }
            }
            console.log("\x1b[0m", '');

            //Calculate
            priceTick();
            calculateWetherToSell();
        }
    });
}

function calculateWetherToSell() {

    //If we previously made profit
    if (madeBuyOrderDate) {

        var currentDate = new Date();
        var minutesEarlierFromNow = new Date(currentDate.getTime() - (makeProfitAgainInterval * 60 * 1000));
        if (minutesEarlierFromNow < madeBuyOrderDate) {
            console.log('===============================');
            console.log('We recently made an buy order');
            console.log('Waiting..');
            console.log('==============================');
            console.log('');
            return;
        }
    }

    //Loop last x_amount candles
    //To see if there is downward trend of X nmbr of candlesToCheck
    var passed = false;
    var positiveCandles = 0;
    var extraPositiveCandle = 0;
    for (var i = (candles.length - candlesToCheck); i < candles.length; i++) {

        if (candles[i].result >= 0) {
            positiveCandles++;
        }
    }

    //If last candle is heavy drop
    if ((candles[candles.length - 1].percentage - 100) <= heavyDropPercentage) {
        console.log('============================================================  ');
        console.log('Heavy drop measured!');
        console.log('Lowering max amount of positive candles threshhold by: ' + maximumCandlesPositiveExtraForDrop);
        console.log('=============================================================');
        console.log('');

        //Lower positive candles treshold
        extraPositiveCandle = extraPositiveCandle + maximumCandlesPositiveExtraForDrop;
    }

    console.log('positive candles: ' + positiveCandles);
    console.log('positive candles max: ' + maximumCandlesPositive);

    // Add weight for second last candle being an upward trend
    // Replaced for not buying at all
    if (candles[candles.length - 2].result > 0) {

        console.log('2nd last is positive + 1');
        extraPositiveCandle = extraPositiveCandle - 1;
    }

    //Pass if positive candles is below threshold
    if (positiveCandles <= (maximumCandlesPositive + extraPositiveCandle)) {

        console.log('Passed check');
        passed = true
    }

    //If second last candle is positive do not buy
    if (candles[candles.length - 2].result > 0 && passed === true) {

        console.log('2nd last is positive not buying');
        passed = false;
    }

    //FAILSAFES

    //Prevent buy lock in case of all positive candles
    if (positiveCandles >= (candlesToCheck - 1)) {

        console.log('Preventing sell lock...');
        passed = false;
    }

    //If last candle is below minumum buy.
    if (Number(candles[candles.length - 1].percentage - 100).toFixed(6) > minimumBuyPercentage && passed === true && Number(candles[candles.length - 1].percentage - 100).toFixed(6) < 0) {

        passed = false;
        console.log('');
        console.log('We are not dropping by atleast: ' + minimumBuyPercentage + '%');
        console.log('');
    }

    //TODO add depth charth analysis

    //If not sold and check failed
    if (true === passed && false === sold) {

        detailedAnalysis();
    } else {

        //Do nothing
        console.log('Hodling on.')
        console.log("\x1b[0m", '');
    }
}


function detailedAnalysis() {

    performingDetailedAnalysis = true;

    console.log("\x1b[36m", 'Retrieving detailed 1m candle stick data:');

    var options = {
        url: baseUrl + '/api/v1/klines?symbol=VENBTC&interval=1m',
        method: 'GET',
        headers: {
            "Content-Type": "application/json"
        },
        body: ''
    };

    var detailedCandles = [];

    request(options, function (error, response, body) {
        if (error) {
            console.log(error);
            performingDetailedAnalysis = false;
        }
        if (!error && response.statusCode === 200) {

            var result = JSON.parse(body);

            for (var i = result.length - displayAmountOfDetailedCandles; i < result.length; i++) {

                if (result[i] !== null) {

                    var openTime = result[i][0];
                    var open = parseFloat(result[i][1]).toFixed(14);
                    var close = parseFloat(result[i][4]).toFixed(14);
                    var closeTime = result[i][6];
                    var closeDate = new Date(closeTime + 3600000).toTimeString();

                    var difference = Number(close - open).toFixed(10);
                    var percentage = Number((close / open) * 100).toFixed(4);
                    var plusIndicator = (difference >= 0) ? '+' : '';

                    var detailedCandle = {
                        "openTime": openTime,
                        "open": open,
                        "close": close,
                        "closeTime": closeTime,
                        "result": difference,
                        "percentage": percentage
                    };

                    var color = (close >= open) ? green : red;

                    if (i === (result.length - candlesDetailedToCheck)) {
                        console.log('==> ');
                    }

                    //Log result
                    console.log(color, 'Open: ' + Number(open).toFixed(10) + ' | Close: ' + Number(close).toFixed(10) + ' | Difference: ' + plusIndicator + '' + difference + ' | Percentage: ' + plusIndicator + '' + Number(percentage - 100).toFixed(6) + '%' + ' | Time: ' + closeDate);

                    detailedCandles.push(detailedCandle);
                }
            }
            console.log("\x1b[0m", '');

            var detailedCheckPassed = false;
            var positiveDetailedCandles = 0;
            var extraPositiveDetailedCandles = 0;

            //Count positive candles
            for (var y = (detailedCandles.length - candlesDetailedToCheck); y < detailedCandles.length; y++) {

                if (detailedCandles[y].result >= 0) {
                    positiveDetailedCandles++;
                }
            }

            // Add weight for second last candle being an upward trend
            // Replaced for not buying at all
            if (candles[candles.length - 2].result > 0) {

                console.log('2nd last is positive + 1');
                extraPositiveDetailedCandles = extraPositiveDetailedCandles - 1;
            }

            //Pass if positive candles is below threshold
            if (positiveDetailedCandles <= (maximumDetailedCandlesPositive + extraPositiveDetailedCandles)) {

                console.log('Passed detailed check');
                detailedCheckPassed = true
            }

            //If last candle is upward do not buy.
            if (detailedCandles[detailedCandles.length - 1].result > 0) {

                detailedCheckPassed = false;
            }

            if (detailedCheckPassed === true) {

                console.log('Sell9ng!!');
                sell();
                performingDetailedAnalysis = false;
            }

        } else {
            performingDetailedAnalysis = false;
        }
    });

    performingDetailedAnalysis = false;
}


function buy(quantity) {

    //Stop buy ticks
    buying = true;
    console.log('Buying ' + quantity + ' VEN for: ' + venPrice);

    var query = 'symbol=VENBTC&side=BUY&type=MARKET&quantity=' + quantity + '&timestamp=' + getTimestamp();
    var hash = crypto.createHmac('sha256', secret).update(query).digest('hex');
    var queryBody = query + '&signature=' + hash;
    var options = {
        url: baseUrl + '/api/v3/order?' + queryBody,
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "X-MBX-APIKEY": apiKey
        }
    };

    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            //Log result
            console.log('Order done: ' + body);
            console.log("\x1b[0m", '');

            var result = JSON.parse(body);
            activeOrderId = result.orderId;
            activeOrderPending = true;

            getActiveOrderStatus();

        } else {

            var err = JSON.parse(body);
            if (err.msg === "Account has insufficient balance for requested action.") {
                //Buy again
                console.log('=============================================');
                console.log('Does not have sufficiant funds..Trying again');
                console.log('=============================================');
            } else {

                //Other error try again
                console.log('Error:');
                console.log(body);
            }

            console.log("\x1b[0m", '');
            buying = false;
        }
    });
}


function getActiveOrderStatus() {

    var query = 'symbol=VENBTC&orderId=' + activeOrderId + '&timestamp=' + getTimestamp();
    var hash = crypto.createHmac('sha256', secret).update(query).digest('hex');
    var queryBody = query + '&signature=' + hash;

    var options = {
        url: baseUrl + '/api/v3/order?' + queryBody,
        method: 'GET',
        headers: {
            "Content-Type": "application/json",
            "X-MBX-APIKEY": apiKey
        }
    };

    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            //Log result
            var result = JSON.parse(body);
            var status = result.status;
            var side = result.side;

            if (status === 'FILLED') {
                console.log('Order is FILLED!');
                console.log("\x1b[0m", '');

                if ('BUY' === side) {

                    madeBuyOrderDate = new Date().getTime();

                    if (buyback === true) {

                        console.log('====================================');
                        console.log('Buyback order Completed');
                        console.log('====================================');
                        console.log("\x1b[0m", '');
                    } else {

                        console.log('====================================');
                        console.log('BUY order complete!');
                        console.log('====================================');
                        console.log("\x1b[0m", '');


                        for (var i = 0; i < 20; i++) {

                            console.log('Profit!');
                        }
                    }

                    //Go back to SELL MODE
                    sold = false;
                    buyback = false;
                    activeOrderPending = false;
                }

                if ('SELL' === side) {

                    console.log('====================================');
                    console.log('SELL order confirmed!')
                    console.log('====================================');
                    console.log("\x1b[0m", '');

                    //Enter 2nd stage of buying fase
                    activeOrderPending = false;
                }
            }

        } else {
            console.log(body);
        }
    });
}

function sell() {

    //Prevent buying on first tick in rare instances
    if (venPrice === 0) {
        return;
    }

    if (sold) {
        return;
    }

    console.log('selling! ' + sellQuantity + ' VEN');
    sold = true;

    var query = 'symbol=VENBTC&side=SELL&type=MARKET&quantity=' + sellQuantity + '&timestamp=' + getTimestamp();
    var hash = crypto.createHmac('sha256', secret).update(query).digest('hex');
    var queryBody = query + '&signature=' + hash;
    var options = {
        url: baseUrl + '/api/v3/order?' + queryBody,
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "X-MBX-APIKEY": apiKey
        }
    };

    request(options, function (error, response, body) {
        if (error) {
            sold = false;
            console.log(error);
        }
        if (!error && response.statusCode === 200) {

            //Log result
            console.log('====================================');
            console.log('Order done: ' + body);
            console.log('===================================');
            console.log("\x1b[0m", '');

            var result = JSON.parse(body);

            //Wait for order
            activeOrderId = result.orderId;
            activeOrderPending = true;

        } else {
            console.log(body);
            sold = false;
        }
    });
}


function get24hrChange() {

    console.log(magenta, 'Retrieving last 24hr VEN stats');
    console.log("\x1b[0m", '');
    var options = {
        url: baseUrl + '/api/v1/ticker/24hr?symbol=VENBTC',
        method: 'GET',
        headers: {
            "Content-Type": "application/json"
        },
        body: ''
    };
    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            //Log result
            var result = JSON.parse(body);

            console.log(magenta, 'Low price:' + result.lowPrice);
            console.log(magenta, 'High price:' + result.highPrice);
            console.log(magenta, 'Price change:' + result.priceChange);
            console.log(magenta, 'Price % change: ' + result.priceChangePercent);
            console.log("\x1b[0m", '');
        }
    });
}

function priceTick() {

    venUsdtPriceLast = venUsdtPrice;

    //Ven price
    var options = {
        url: baseUrl + '/api/v3/ticker/price?symbol=VENBTC',
        method: 'GET',
        headers: {
            "Content-Type": "application/json"
        },
        body: ''
    };
    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            var result = JSON.parse(body);
            var tempPrice = result.price;

            venPrice = parseFloat(result.price);

            //Btc price
            var options = {
                url: baseUrl + '/api/v3/ticker/price?symbol=BTCUSDT',
                method: 'GET',
                headers: {
                    "Content-Type": "application/json"
                },
                body: ''
            };
            request(options, function (error, response, body) {
                if (error) console.log(error);
                if (!error && response.statusCode === 200) {

                    //Log result
                    var result = JSON.parse(body);
                    venUsdtPrice = Number(venPrice * btcPrice).toFixed(6);
                    var difference = venUsdtPrice - venUsdtPriceLast;
                    var pricePercentageDifference = Number((difference / venUsdtPrice) * 100).toFixed(5);

                    var color = (difference >= 0) ? green : red;

                    console.log("\x1b[36m", 'Price BTC current: $' + result.price);
                    console.log("\x1b[36m", 'Price VEN current: ' + tempPrice + ' / $' + venUsdtPrice);
                    console.log("\x1b[36m", 'Price VEN/DOLLAR last: $' + venUsdtPriceLast);

                    btcPrice = parseFloat(result.price).toFixed(12);

                    var plusIndicator = (pricePercentageDifference >= 0) ? '+' : '';
                    console.log(color, 'Difference: $' + Number(difference).toFixed(6) + ', ' + plusIndicator + '' + Number(pricePercentageDifference).toFixed(4) + '%');
                    console.log("\x1b[0m", '');
                }
            });
        }
    });
}

function getAllOrders() {

    var query = 'symbol=VENBTC&timestamp=' + getTimestamp();
    var hash = crypto.createHmac('sha256', secret).update(query).digest('hex');
    var queryBody = query + '&signature=' + hash;

    var options = {
        url: baseUrl + '/api/v3/allOrders?' + queryBody,
        method: 'GET',
        headers: {
            "Content-Type": "application/json",
            "X-MBX-APIKEY": apiKey
        }
    };

    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            //Log result
            var result = JSON.parse(body);
            console.log('Orders found:' + result.length);

            for (var i = 0; i < result.length; i++) {
                console.log('Order: ' + (i + 1) + ' ' + JSON.stringify(result[i]));
            }

            console.log("\x1b[0m", '');
        } else {
            console.log(body);
        }
    });
}

function cancelAllOpenPartialOrders() {

    console.log('====================================');
    console.log('Looking for open or partial orders..');
    console.log('====================================');

    var query = 'symbol=VENBTC&timestamp=' + getTimestamp();
    var hash = crypto.createHmac('sha256', secret).update(query).digest('hex');
    var queryBody = query + '&signature=' + hash;

    var options = {
        url: baseUrl + '/api/v3/allOrders?' + queryBody,
        method: 'GET',
        headers: {
            "Content-Type": "application/json",
            "X-MBX-APIKEY": apiKey
        }
    };

    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            //Log result
            var result = JSON.parse(body);

            var openOrders = [];
            for (var i = 0; i < result.length; i++) {
                if (result[i].status === "NEW" || result[i] === "PARTIALLY_FILLED") {
                    console.log('Open order found: ' + JSON.stringify(result[i]));
                    openOrders.push(result[i]);

                }
            }

            if (0 >= openOrders.length) {

                console.log('====================================');
                console.log('No open or partial orders found');
                console.log('====================================');
                console.log("\x1b[0m", '');
            } else {

                for (var x = 0; x < openOrders.length; x++) {

                    cancelOrder(openOrders[x].orderId);
                }

            }

        } else {
            console.log(body);
        }
    });
}

function cancelOrder(orderId) {

    console.log('====================================');
    console.log('Canceling order: ' + orderId);
    console.log('====================================');

    var query = 'symbol=VENBTC&orderId=' + orderId + '&timestamp=' + getTimestamp();
    var hash = crypto.createHmac('sha256', secret).update(query).digest('hex');
    var queryBody = query + '&signature=' + hash;

    var options = {
        url: baseUrl + '/api/v3/order?' + queryBody,
        method: 'DELETE',
        headers: {
            "Content-Type": "application/json",
            "X-MBX-APIKEY": apiKey
        }
    };

    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            console.log('====================================');
            console.log('Order: ' + orderId + ' canceled');
            console.log('====================================');

        } else {
            console.log(body);
        }
    });
}

function getAccountBalance() {

    var query = 'timestamp=' + getTimestamp();
    var hash = crypto.createHmac('sha256', secret).update(query).digest('hex');
    var queryBody = query + '&signature=' + hash;

    var options = {
        url: baseUrl + '/api/v3/account?' + queryBody,
        method: 'GET',
        headers: {
            "Content-Type": "application/json",
            "X-MBX-APIKEY": apiKey
        }
    };
    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {

            var result = JSON.parse(body);
            var balances = result.balances;

            console.log('=========================================')
            for (var i = 0; i < balances.length; i++) {

                //VEN balance
                if (balances[i].asset === 'VEN') {

                    balanceFree = balances[i].free;
                    balanceLocked = balances[i].locked;
                    console.log('Balance VEN free: ' + balances[i].free + ' locked: ' + balances[i].locked);
                }

                //BTC balance
                if (balances[i].asset === 'BTC') {

                    balanceFreeBtc = balances[i].free;
                    balanceLockedBtc = balances[i].locked;
                    console.log('Balance BTC free: ' + balances[i].free + ' BTC: ' + balances[i].locked);
                }
            }
            console.log('=========================================')
            console.log("\x1b[0m", '');
        }
    });
}

function getTimestamp() {
    var timeSTamp = new Date().getTime();
    return timeSTamp + serverTimeOffset;
}

function getServerTimeOffset() {

    var options = {
        url: baseUrl + '/api/v1/time',
        method: 'GET',
        headers: {
            "Content-Type": "application/json",
        },
        body: ''
    };

    request(options, function (error, response, body) {
        if (error) console.log(error);
        if (!error && response.statusCode === 200) {
            var result = JSON.parse(body);

            var serverTimeStamp = result.serverTime;
            var localTimeStamp = new Date().getTime();

            serverTimeOffset = serverTimeStamp - localTimeStamp;

            console.log('=========================================')
            console.log('Correcting local tot server time offset..')
            console.log('server time: ' + serverTimeStamp);
            console.log('local time: ' + localTimeStamp);
            console.log('timestamp offset: ' + serverTimeOffset);
            console.log('=========================================')
            console.log("\x1b[0m", '');
        }
    });
}


var bailOutReasons = [
    "I'm an hero with cowards legs",
    "I'm not an coward..I just don't like to buy low right now..",
    "The cowards sneak to death...The brave live on",
    "Even cowards can endure hardship, only the brave can endure suspense.",
    "My connection laggy, wi-fi weak, bags are heavy"];
