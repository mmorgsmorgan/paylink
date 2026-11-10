// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title PayLink
 * @notice Escrows USDC for recipients identified by a throwaway link key.
 * @dev Whoever holds the link secret controls the funds until claimed; the sender
 * can cancel any time before a claim. Keep the private key only in the URL fragment.
 * Creation requires the link key's signature authorizing the sender and amounts.
 * Claims authorize both a destination and a relayer; only that relayer may submit
 * the claim and collect the relay fee unless the destination self-claims.
 * No owner, administrator, upgrade mechanism, or native-currency handling exists.
 */
contract PayLink is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice A key progresses out of None once and can never be reused.
    enum Status { None, Active, Claimed, Cancelled }

    /// @notice The sender, escrowed amounts, and lifecycle state for a link key.
    struct Link {
        address sender;
        uint128 amount;
        uint128 relayFee;
        Status status;
    }

    /// @notice The immutable escrow token; amounts are expressed in its base units.
    /// @dev Intended for 6-decimal USDC at
    /// 0x3600000000000000000000000000000000000000 on Arc Testnet.
    IERC20 public immutable token;

    mapping(address key => Link) private links;

    /// @notice The token address cannot be zero.
    error InvalidToken();
    /// @notice The link key cannot be zero.
    error InvalidKey();
    /// @notice The principal amount must be nonzero.
    error InvalidAmount();
    /// @notice The key has already been used, including cancelled or claimed links.
    error KeyAlreadyUsed(address key);
    /// @notice The requested link is not active.
    error LinkNotActive(address key);
    /// @notice The destination cannot be zero or this contract.
    error InvalidRecipient();
    /// @notice The recovered signer does not match the link key.
    error InvalidSignature();
    /// @notice Only the original sender may cancel a link.
    error NotSender();
    /// @notice Only the signed relayer may submit a claim.
    error NotRelayer();

    /// @notice Emitted when a sender funds a new link.
    event LinkCreated(
        address indexed key,
        address indexed sender,
        uint128 amount,
        uint128 relayFee
    );

    /// @notice Emitted on claim; relayFee is zero when the destination self-claims.
    event LinkClaimed(
        address indexed key,
        address indexed to,
        address relayer,
        uint128 amount,
        uint128 relayFee
    );

    /// @notice Emitted when an active link is cancelled and refunded.
    event LinkCancelled(address indexed key);

    /// @notice Sets the escrow token permanently, without granting administrator rights.
    /// @param _token The USDC ERC-20 contract, supplied at deployment.
    constructor(IERC20 _token) {
        if (address(_token) == address(0)) revert InvalidToken();
        token = _token;
    }

    /// @notice Escrows principal and a relay fee under a never-before-used link key.
    /// @dev Requires a prior token allowance for amount + relayFee and the key's
    /// EIP-191 personal-message signature over createDigest. Intended for
    /// standard USDC transfers, not fee-on-transfer or rebasing tokens.
    /// @param key The public address corresponding to the secret link private key.
    /// @param amount The principal in token base units.
    /// @param relayFee The fee reserved for the signed relayer, in token base units.
    /// @param keySignature The link key's signature authorizing this sender and amounts.
    function createLink(address key, uint128 amount, uint128 relayFee, bytes calldata keySignature) external nonReentrant {
        if (key == address(0)) revert InvalidKey();
        if (amount == 0) revert InvalidAmount();
        if (links[key].status != Status.None) revert KeyAlreadyUsed(key);

        bytes32 signedHash = MessageHashUtils.toEthSignedMessageHash(createDigest(key, msg.sender, amount, relayFee));
        (address signer, ECDSA.RecoverError error, ) = ECDSA.tryRecover(signedHash, keySignature);
        if (error != ECDSA.RecoverError.NoError || signer != key) revert InvalidSignature();

        links[key] = Link({
            sender: msg.sender,
            amount: amount,
            relayFee: relayFee,
            status: Status.Active
        });

        token.safeTransferFrom(msg.sender, address(this), uint256(amount) + uint256(relayFee));
        emit LinkCreated(key, msg.sender, amount, relayFee);
    }

    /// @notice Returns the inner creation hash BEFORE the eth-signed-message prefix.
    /// @dev Clients sign this raw bytes32 using signMessage({ message: { raw: digest } }).
    /// Chain, contract, link key, sender, and amounts bind creation to its context.
    /// @param key The link key authorizing creation.
    /// @param sender The sender authorized to fund the link.
    /// @param amount The principal in token base units.
    /// @param relayFee The reserved relay fee in token base units.
    /// @return The unprefixed keccak256 creation hash.
    function createDigest(address key, address sender, uint128 amount, uint128 relayFee) public view returns (bytes32) {
        return keccak256(abi.encodePacked("PayLink.create", block.chainid, address(this), key, sender, amount, relayFee));
    }

    /// @notice Claims a link to the destination through the relayer authorized by its private key.
    /// @dev The signature is an EIP-191 personal-message signature over claimDigest.
    /// Only the signed relayer may submit. Self-claims pay principal and fee to the
    /// destination; otherwise the relayer receives the reserved fee.
    /// Invalid ECDSA encodings revert through OpenZeppelin.
    /// @param key The funded link key.
    /// @param to The signed destination, neither zero nor this contract.
    /// @param relayer The signed claim submitter, which must equal msg.sender.
    /// @param signature The link key's ECDSA signature.
    function claim(address key, address to, address relayer, bytes calldata signature) external nonReentrant {
        Link storage link = links[key];
        if (link.status != Status.Active) revert LinkNotActive(key);
        if (to == address(0) || to == address(this)) revert InvalidRecipient();

        if (msg.sender != relayer) revert NotRelayer();

        bytes32 signedHash = MessageHashUtils.toEthSignedMessageHash(claimDigest(key, to, relayer));
        if (ECDSA.recover(signedHash, signature) != key) revert InvalidSignature();

        uint128 amount = link.amount;
        uint128 relayFee = link.relayFee;
        link.status = Status.Claimed;

        uint128 paidRelayFee;
        if (relayer == to) {
            token.safeTransfer(to, uint256(amount) + uint256(relayFee));
        } else {
            token.safeTransfer(to, uint256(amount));
            if (relayFee != 0) {
                paidRelayFee = relayFee;
                token.safeTransfer(relayer, uint256(relayFee));
            }
        }

        emit LinkClaimed(key, to, relayer, amount, paidRelayFee);
    }

    /// @notice Returns the inner claim hash BEFORE the eth-signed-message prefix.
    /// @dev Clients sign this raw bytes32 using signMessage({ message: { raw: digest } }).
    /// Chain, contract, link key, destination, and relayer bind the claim to its context.
    /// @param key The link key authorizing the claim.
    /// @param to The destination authorized to receive the funds.
    /// @param relayer The authorized claim submitter and fee recipient.
    /// @return The unprefixed keccak256 claim hash.
    function claimDigest(address key, address to, address relayer) public view returns (bytes32) {
        return keccak256(abi.encodePacked("PayLink.claim", block.chainid, address(this), key, to, relayer));
    }

    /// @notice Cancels an active link and refunds principal plus fee to its sender.
    /// @dev Only the original sender may cancel; the key remains permanently used.
    /// @param key The link key to cancel.
    function cancel(address key) external nonReentrant {
        Link storage link = links[key];
        if (link.status != Status.Active) revert LinkNotActive(key);
        if (msg.sender != link.sender) revert NotSender();

        link.status = Status.Cancelled;
        token.safeTransfer(link.sender, uint256(link.amount) + uint256(link.relayFee));
        emit LinkCancelled(key);
    }

    /// @notice Returns the stored details of a link, including terminal states.
    /// @param key The link key to inspect.
    /// @return sender The original depositor, or zero for an unused key.
    /// @return amount The original principal in token base units.
    /// @return relayFee The originally reserved fee in token base units.
    /// @return status The current lifecycle state.
    function getLink(address key)
        external
        view
        returns (address sender, uint128 amount, uint128 relayFee, Status status)
    {
        Link storage link = links[key];
        return (link.sender, link.amount, link.relayFee, link.status);
    }
}
