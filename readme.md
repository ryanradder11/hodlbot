**Amazing Hodlbot**
It hodl's all your Vennies


*Install instructions*

1. cd to directory

2. $ docker build . tradebot/hodl

3. $ docker run tradebot/hodl



*Settings:*

/*
    Interval of candles
    This is and value that really
    is worht of expermementing with
    Enmugs:

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

        //default 1m

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
    How many candles can be positive?
    If there are less green candles then this it will sell
    Should be less then CandlesToCheck
 */
var maximumCandlesPositive = 3;

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
    How much should you sell per transaction
    Higher is better
 */
var sellQuantity = 150;

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

