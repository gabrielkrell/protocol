const { PriceFeedInterface } = require("./PriceFeedInterface");
const { parseFixed } = require("@uma/common");
const moment = require("moment");

// An implementation of PriceFeedInterface that uses the Quandl free API to retrieve prices.
// API details can be found here: https://docs.quandl.com/docs
class QuandlPriceFeed extends PriceFeedInterface {
  /**
   * @notice Constructs the QuandlPriceFeed.
   * @param {Object} logger Winston module used to send logs.
   * @param {Object} web3 Provider from truffle instance to connect to Ethereum network.
   * @param {String} quandlApiKey Quandl Data API key. Will get rate-limited without an API key.
   * @param {String} datasetCode Code identifying the database to which the dataset belongs. Example: "CHRIS".
   * @param {String} databaseCode Code identifying the dataset. Example: "CME_MGC1".
   * @param {Integer} lookback How far in the past the historical prices will be available using getHistoricalPrice.
   * @param {Object} networker Used to send the API requests.
   * @param {Function} getTime Returns the current time.
   * @param {Number} priceFeedDecimals Number of priceFeedDecimals to use to convert price to wei.
   * @param {Integer} minTimeBetweenUpdates Min number of seconds between updates. If update() is called again before
   *      this number of seconds has passed, it will be a no-op.
   */
  constructor(
    logger,
    web3,
    quandlApiKey,
    datasetCode,
    databaseCode,
    lookback,
    networker,
    getTime,
    priceFeedDecimals = 18,
    minTimeBetweenUpdates = 43200
    // 12 hours is a reasonable default since this pricefeed returns daily granularity at best.
  ) {
    super();
    this.logger = logger;
    this.web3 = web3;

    this.apiKey = quandlApiKey;
    this.datasetCode = datasetCode.toUpperCase();
    this.databaseCode = databaseCode.toUpperCase();
    this.lookback = lookback;
    this.uuid = `Quandl-${datasetCode}-${databaseCode}`;
    this.networker = networker;
    this.getTime = getTime;
    this.minTimeBetweenUpdates = minTimeBetweenUpdates;
    this.priceFeedDecimals = priceFeedDecimals;

    this.toBN = this.web3.utils.toBN;

    this.convertPriceFeedDecimals = number => {
      // Converts price result to wei
      // returns price conversion to correct decimals as a big number.
      // Note: Must ensure that `number` has no more decimal places than `priceFeedDecimals`.
      return this.toBN(parseFixed(number.toString().substring(0, priceFeedDecimals), priceFeedDecimals).toString());
    };
  }

  getCurrentPrice() {
    return this.currentPrice;
  }

  async getHistoricalPrice(time, verbose = false) {
    if (this.lastUpdateTime === undefined) {
      throw new Error(`${this.uuid}: undefined lastUpdateTime`);
    }

    // Set first price period in `historicalPricePeriods` to first non-null price.
    let firstPricePeriod;
    for (let p in this.historicalPricePeriods) {
      if (this.historicalPricePeriods[p] && this.historicalPricePeriods[p].openTime) {
        firstPricePeriod = this.historicalPricePeriods[p];
        break;
      }
    }

    // If there are no valid price periods, return null.
    if (!firstPricePeriod) {
      throw new Error(`${this.uuid}: no valid price periods`);
    }

    // If the time is before the first piece of data in the set, return null because
    // the price is before the lookback window.
    if (time < firstPricePeriod.openTime) {
      throw new Error(`${this.uuid}: time ${time} is before firstPricePeriod.openTime`);
    }

    // historicalPricePeriods are ordered from oldest to newest.
    // This finds the first pricePeriod whose closeTime is after the provided time.
    const match = this.historicalPricePeriods.find(pricePeriod => {
      return time < pricePeriod.closeTime;
    });

    // If there is no match, that means that the time was past the last data point.
    // In this case, the best match for this price is the current price.
    let returnPrice;
    if (match === undefined) {
      returnPrice = this.currentPrice;
      if (verbose) {
        console.group(`\n(${this.datasetCode}:${this.databaseCode}) No OHLC available @ ${time}`);
        console.log(
          `- ✅ Time is later than earliest historical time, fetching current price: ${this.web3.utils.fromWei(
            returnPrice.toString()
          )}`
        );
        console.log(
          `- ⚠️  If you want to manually verify the specific exchange prices, you can make a GET request to: \n- https://www.quandl.com/api/v3/datasets/${this.datasetCode}/${this.databaseCode}/data.json`
        );
        console.groupEnd();
      }
      return returnPrice;
    }

    returnPrice = match.openPrice;
    if (verbose) {
      console.group(`\n(${this.datasetCode}:${this.databaseCode}) Historical OHLC @ ${match.closeTime}`);
      console.log(`- ✅ Open Price:${this.web3.utils.fromWei(returnPrice.toString())}`);
      console.log(
        `- ⚠️  If you want to manually verify the specific exchange prices, you can make a GET request to: \n- https://www.quandl.com/api/v3/datasets/${this.datasetCode}/${this.databaseCode}/data.json`
      );
      console.log(
        '- This will return an OHLC data packet as "result", which contains in order: \n- ["Date","Open","High","Low","Last","Change","Settle","Volume","Previous Day Open Interest"].'
      );
      console.log("- We use the OpenPrice to compute the median.");
      console.groupEnd();
    }
    return returnPrice;
  }

  getHistoricalPricePeriods() {
    return this.historicalPricePeriods.map(historicalPrice => {
      return [historicalPrice.closeTime, historicalPrice.closePrice];
    });
  }
  getLastUpdateTime() {
    return this.lastUpdateTime;
  }

  getLookback() {
    return this.lookback;
  }

  getPriceFeedDecimals() {
    return this.priceFeedDecimals;
  }

  async update() {
    const currentTime = this.getTime();

    // Return early if the last call was too recent.
    if (this.lastUpdateTime !== undefined && this.lastUpdateTime + this.minTimeBetweenUpdates > currentTime) {
      this.logger.debug({
        at: "QuandlPriceFeed",
        message: "Update skipped because the last one was too recent",
        currentTime: currentTime,
        lastUpdateTimestamp: this.lastUpdateTime,
        timeRemainingUntilUpdate: this.lastUpdateTimes + this.minTimeBetweenUpdates - currentTime
      });
      return;
    }

    this.logger.debug({
      at: "QuandlPriceFeed",
      message: "Updating QuandlPriceFeed",
      currentTime: currentTime,
      lastUpdateTimestamp: this.lastUpdateTime
    });

    // Find the closest day that completed before the beginning of the lookback window, and use
    // it as the start date.
    const startLookbackWindow = currentTime - this.lookback;
    const startDateString = this._secondToDateTime(startLookbackWindow);
    const endDateString = this._secondToDateTime(currentTime);

    // 1. Construct URL.
    // See https://docs.quandl.com/docs/parameters-2 for how this url is constructed.
    const url = [
      `https://www.quandl.com/api/v3/datasets/${this.datasetCode}/${this.databaseCode}/data.json?`,
      `start_date=${startDateString}&end_date=${endDateString}`,
      `&collapse=daily&api_key=${this.apiKey}`
      // Theoretically you could change granularity to be greater than daily but this doesn't seem
      // useful to implement flexibility for right now.
    ].join("");

    // 2. Send request.
    const historyResponse = await this.networker.getJson(url);

    // 3. Check responses.
    if (
      !historyResponse?.dataset_data?.data ||
      historyResponse.dataset_data.data.length === 0 ||
      historyResponse.dataset_data.data.some(dailyData => dailyData.length === 0)
    ) {
      throw new Error(`🚨Could not parse price result from url ${url}: ${JSON.stringify(historyResponse)}`);
    }

    // 4. Parse results.
    // Return data structure:
    // {
    //   "dataset_data": {
    //     "data": [
    //       [
    //         "2021-03-16",
    //          1730.2,
    //          1740.5,
    //          1724.4,
    //          1730.1,
    //          1.7,
    //          1730.9,
    //          41843.0,
    //          21285.0
    //       ]
    //      ...more data for different days
    //     ],
    //     ...other data we don't care about
    //   }
    // }
    const newHistoricalPricePeriods = historyResponse.dataset_data.data
      .map(dailyData => ({
        // Output data should be a list of objects with only the open and close times and prices.
        // Note: Data is formatted as [Date, Open, High, Low, Last, Change, Settle, Volume, Previous Day Open Interest]
        openTime: this._dateTimeToSecond(dailyData[0]) - 24 * 3600,
        closeTime: this._dateTimeToSecond(dailyData[0]),
        openPrice: this.convertPriceFeedDecimals(dailyData[1]),
        closePrice: this.convertPriceFeedDecimals(dailyData[4])
      }))
      .sort((a, b) => {
        // Sorts the data such that the oldest elements come first.
        return a.openTime - b.openTime;
      });

    // 5. Store results.
    this.currentPrice = newHistoricalPricePeriods[newHistoricalPricePeriods.length - 1].closePrice;
    this.historicalPricePeriods = newHistoricalPricePeriods;
    this.lastUpdateTime = currentTime;
  }

  _secondToDateTime(inputSecond) {
    return moment.unix(inputSecond).format("YYYY-MM-DD");
  }
  _dateTimeToSecond(inputDateTime) {
    return moment(inputDateTime, "YYYY-MM-DD").unix();
  }
}

module.exports = {
  QuandlPriceFeed
};