# @uma/bot-strategy-runner

This package contains a generalized bot runner enabling simple execution of multiple concurrent UMA bots on one machine.

## Installing the package

```bash
yarn add @uma/bot-strategy-runner
yarn build
```

Or, if you cloned from the mono repo simply run the following from the root of the mono repo:

```bash
yarn
yarn qbuild
```

## Quick start

This package requires a simple JSON config to parameterize the strategy runner. A simple config that enables a liquidator and disputer on 3 contracts would look like this:

```json
{
  "globalAddressWhitelist": [
    "0x0f4e2a456aAfc0068a0718E3107B88d2e8f2bfEF",
    "0xd9af2d7E4cF86aAfBCf688a47Bd6b95Da9F7c838",
    "0xd60139B287De1408f8388f5f57fC114Fb4B03328"
  ],
  "commonConfig": {
    "priceFeedConfig": {
      "cryptowatchApiKey": "YOUR-CRYPTO-WATCH-API-KEY"
    }
  },
  "liquidatorSettings": { "enableBotType": true },
  "disputerSettings": { "enableBotType": true },
  "monitorSettings": { "enableBotType": false }
}
```

Add this contents to a `BotRunnerConfig.json` file within this package.

Then, to start the strategy runner run:

```bash
node ./dist/src/index.js --fileConfig ./BotRunnerConfig.json
```

This will spin up liquidators and monitors on these three contract addresses.

## All config options

The strategy runner is design to support a wide range of execution configurations with the goal of being as configurable as standalone UMA bots, while enabling paralization. Some of these configs are discussed below.

### Reading in configs from remote github

Bot runners might want to store their config files within a github repo. This can be read in as follows:

```bash
node ./dist/src/index.js --urlConfig  https://api.github.com/repos/<your-organization>/<your-repo-name>/contents/<path-to-your-json-file> -accessToken <github-access-token>
```

Be sure to replace the `<your-x>` content with your actual values. This kind of config can be used in conjunction with the `--fileConfig` flag, wherein the configs will be joined.

### Config file structure and custimization

The config file can be customized with a bunch of extra params and settings. The snippet below showcases each section and what can be placed in it for a fully custom setup.

```javascript
interface strategyRunnerConfig {
  botNetwork?: string; // network to connect the executed bots on. Defaults to `mainnet_mnemonic`
  pollingDelay?: number; // how frequently the strategy runner should re-run after all strategies have finished. defaults to 120 seconds. If set to 0 the strategy runner will run in serverless mode.
  botConcurrency?: number; // how many strategies should be run in parallel. defaults to 10.
  strategyTimeout?: number; // how long the runner should wait if a strategy is timing out. Defaults to 60 seconds.
  verboseLogs?: boolean; // toggles if the runner should produce all logs generated by all strategies. WARNING: can be noisy! Defaults to false.
  emitDebugLogs?: boolean; // toggles if the runner should produce debug logs in execution output. If set to false, the runner will produce any info and above logs on execution. Defaults to false.
  globalAddressWhitelistUrls?: Array<string>; // define an array of URLS that the runner should pull configs in from. UMA maintains a whitelist of approved dev mining contracts that acts as a good starting point for a whitelist of UMA contracts to run bots on.
  globalAddressWhitelist?: Array<string>; // define array of addresses to run strategies on.
  globalAddressBlacklist?: Array<string>; // define array of addresses to blacklist the strategies strategies on. Used to exclude some addresses from URL whitelists.
  commonConfig?: { [key: string]: any }; // define any common configs to apply to all bot types.
  liquidatorSettings?: botSettings; // instance of botSettings. See code snippet below for params.
  disputerSettings?: botSettings;
  monitorSettings?: botSettings;
}
```

Each bot type can be configured with specific settings for that bot as well as additional overrides and settings. The example below is of type `botSettings` and would be placed within the previous config under the `botSettings` section for each bot type.

```javascript
interface botSettings {
  enableBotType: boolean; // boolean to enable or disable a bot type. By default is set to false (disabled)
  addressWhitelist?: Array<string>; // add specific whitelists for this particular bot type. For example if you want a specific address to only have the liquidator running then this would be used.
  addressBlacklist?: Array<string>; // add specific blacklists for this particular bot type. For example if you dont want to run a disputer on a particular address you would add this here.
  commonConfig?: { [key: string]: any }; // Add custom config for all bots of this type. For example if you want all liquidators to have a specific config you should add it here.
  addressConfigOverride?: { [key: string]: { [key: string]: any } }; // override a particular config for a specific contract address. This enables address specific granularity in the configs used for different bot types.
}
```
