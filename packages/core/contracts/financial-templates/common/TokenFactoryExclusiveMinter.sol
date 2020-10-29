pragma solidity ^0.6.0;

import "./SyntheticTokenExclusiveMinter.sol";
import "../../common/interfaces/ExpandedIERC20.sol";
import "./TokenFactory.sol";


/**
 * @title Factory for creating new mintable and burnable tokens.
 */

contract TokenFactoryExclusiveMinter is TokenFactory {
    /**
     * @notice Create a new token and return it to the caller.
     * @dev The caller will become the only minter and burner and the new owner capable of assigning the roles.
     * @param tokenName used to describe the new token.
     * @param tokenSymbol short ticker abbreviation of the name. Ideally < 5 chars.
     * @param tokenDecimals used to define the precision used in the token's numerical representation.
     * @return newToken an instance of the newly created token interface.
     */
    function createToken(
        string calldata tokenName,
        string calldata tokenSymbol,
        uint8 tokenDecimals
    ) external override nonReentrant() returns (ExpandedIERC20 newToken) {
        SyntheticTokenExclusiveMinter mintableToken = new SyntheticTokenExclusiveMinter(
            tokenName,
            tokenSymbol,
            tokenDecimals
        );
        mintableToken.resetMinter(msg.sender);
        mintableToken.addBurner(msg.sender);
        mintableToken.resetOwner(msg.sender);
        newToken = ExpandedIERC20(address(mintableToken));
    }
}