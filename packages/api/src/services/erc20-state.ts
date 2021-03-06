import { clients } from "@uma/sdk";
import { AppState } from "..";
import { asyncValues } from "../libs/utils";

type Config = undefined;
// break out this services specific state dependencies
type Dependencies = Pick<AppState, "provider" | "erc20s" | "collateralAddresses" | "syntheticAddresses">;

export default function (config: Config, appState: Dependencies) {
  const { provider, erc20s, collateralAddresses, syntheticAddresses } = appState;

  // get token state based on contract
  async function getTokenStateFromContract(address: string) {
    const instance = clients.erc20.connect(address, provider);
    return asyncValues({
      address,
      // just in case these fail, return null
      decimals: instance.decimals().catch(() => null),
      name: instance.name().catch(() => null),
      symbol: instance.symbol().catch(() => null),
    });
  }

  async function updateToken(address: string) {
    if (await erc20s.has(address)) return;
    const state = await getTokenStateFromContract(address);
    return erc20s.upsert(address, state);
  }

  // update all tokens based on address, but dont throw errors.
  async function updateTokens(addresses: string[]) {
    return Promise.allSettled(addresses.map(updateToken));
  }

  async function update() {
    const addresses = [...collateralAddresses.values(), ...syntheticAddresses.values()];
    await updateTokens(addresses).then((results) => {
      results.forEach((result) => {
        if (result.status === "rejected") console.error("Error getting token info: " + result.reason.message);
      });
    });
  }
  return {
    update,
    // internal functions meant to support updating
    utils: {
      getTokenStateFromContract,
      updateToken,
      updateTokens,
    },
  };
}
