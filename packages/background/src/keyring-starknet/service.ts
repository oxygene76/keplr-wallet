import { Env } from "@keplr-wallet/router";
import { ChainsService } from "../chains";
import { KeyRingService } from "../keyring";
import { Buffer } from "buffer/";
import { PermissionService } from "../permission";
import {
  CairoUint256,
  Call,
  InvocationsSignerDetails,
  TypedData as StarknetTypedData,
  typedData as starknetTypedDataUtils,
  hash as starknetHashUtils,
  transaction as starknetTransactionUtils,
  provider as starknetProvider,
  V2InvocationsSignerDetails,
  V3InvocationsSignerDetails,
  DeployAccountSignerDetails,
  CallData,
  V2DeployAccountSignerDetails,
  V3DeployAccountSignerDetails,
  DeclareSignerDetails,
  V2DeclareSignerDetails,
  V3DeclareSignerDetails,
  SignerInterface,
  Signature,
  TypedData,
} from "starknet";
import { InteractionService } from "../interaction";

export class KeyRingStarknetService {
  constructor(
    protected readonly chainsService: ChainsService,
    protected readonly keyRingService: KeyRingService,
    protected readonly permissionService: PermissionService,
    protected readonly interactionService: InteractionService
  ) {}

  async init() {
    // TODO: ?
  }

  async getStarknetKeySelected(chainId: string): Promise<{
    hexAddress: string;
    pubKey: Uint8Array;
    address: Uint8Array;
  }> {
    return await this.getStarknetKey(
      this.keyRingService.selectedVaultId,
      chainId
    );
  }

  async getStarknetKey(
    vaultId: string,
    chainId: string
  ): Promise<{
    hexAddress: string;
    pubKey: Uint8Array;
    address: Uint8Array;
  }> {
    const chainInfo = this.chainsService.getModularChainInfoOrThrow(chainId);
    if (!("starknet" in chainInfo)) {
      throw new Error("Chain is not a starknet chain");
    }
    const pubKey = await this.keyRingService.getPubKey(chainId, vaultId);

    // TODO: salt를 어떻게 할지 생각한다...
    //       class hash의 경우도 생각해야함...
    const address = pubKey.getStarknetAddress(
      Buffer.from("11", "hex"),
      Buffer.from(
        "02203673e728fa07de1c2ea60405399ffefaf875f1b7ae54e747659e1e216d94",
        "hex"
      )
    );

    return {
      hexAddress: `0x${Buffer.from(address).toString("hex")}`,
      pubKey: pubKey.toBytes(),
      address,
    };
  }

  async request<T = any>(
    env: Env,
    origin: string,
    type: string,
    _params?: unknown[] | Record<string, unknown>,
    chainId?: string
  ): Promise<T> {
    if (env.isInternalMsg && chainId == null) {
      throw new Error(
        "The chain id must be provided for the internal message."
      );
    }

    const currentChainId =
      this.permissionService.getCurrentChainIdForStarknet(origin) ?? chainId;
    if (currentChainId == null) {
      if (type === "keplr_initStarknetProviderState") {
        return {
          currentChainId: null,
          selectedAddress: null,
        } as T;
      } else {
        throw new Error(
          `${origin} is not permitted. Please disconnect and reconnect to the website.`
        );
      }
    }
    const selectedAddress = (await this.getStarknetKeySelected(currentChainId))
      .hexAddress;

    const result = (await (async () => {
      switch (type) {
        case "keplr_initStarknetProviderState":
        case "keplr_enableStarknetProvider": {
          return {
            currentChainId,
            selectedAddress,
          };
        }
        default: {
          throw new Error(`The type "${type}" is not supported.`);
        }
      }
    })()) as T;

    return result;
  }

  async signStarknetMessageSelected(
    env: Env,
    origin: string,
    chainId: string,
    signer: string,
    typedData: StarknetTypedData
  ): Promise<string[]> {
    return await this.signStarknetMessage(
      env,
      origin,
      this.keyRingService.selectedVaultId,
      chainId,
      signer,
      typedData
    );
  }

  async signStarknetMessage(
    _env: Env,
    _origin: string,
    vaultId: string,
    chainId: string,
    signer: string,
    typedData: StarknetTypedData
  ): Promise<string[]> {
    const key = await this.getStarknetKey(vaultId, chainId);
    if (key.hexAddress !== signer) {
      throw new Error("Invalid signer");
    }

    const msgHash = starknetTypedDataUtils.getMessageHash(typedData, signer);

    const sig = await this.keyRingService.sign(
      chainId,
      vaultId,
      Buffer.from(msgHash.replace("0x", ""), "hex"),
      "keccak256"
    );
    return this.formatEthSignature(sig);
  }

  async signStarknetTransactionSelected(
    env: Env,
    origin: string,
    chainId: string,
    signer: string,
    transactions: Call[],
    details: InvocationsSignerDetails
  ): Promise<string[]> {
    return await this.signStarknetTransaction(
      env,
      origin,
      this.keyRingService.selectedVaultId,
      chainId,
      signer,
      transactions,
      details
    );
  }

  async signStarknetTransaction(
    _env: Env,
    _origin: string,
    vaultId: string,
    chainId: string,
    signer: string,
    transactions: Call[],
    details: InvocationsSignerDetails
  ): Promise<string[]> {
    const key = await this.getStarknetKey(vaultId, chainId);
    if (key.hexAddress !== signer) {
      throw new Error("Invalid signer");
    }

    const compiledCalldata = starknetTransactionUtils.getExecuteCalldata(
      transactions,
      details.cairoVersion
    );
    let msgHash;

    if (Object.values(ETransactionVersion2).includes(details.version as any)) {
      const det = details as V2InvocationsSignerDetails;
      msgHash = starknetHashUtils.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version,
      });
    } else if (
      Object.values(ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3InvocationsSignerDetails;
      msgHash = starknetHashUtils.calculateInvokeTransactionHash({
        ...det,
        senderAddress: det.walletAddress,
        compiledCalldata,
        version: det.version,
        nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
      });
    } else {
      throw Error("unsupported signTransaction version");
    }

    const sig = await this.keyRingService.sign(
      chainId,
      vaultId,
      Buffer.from(msgHash.replace("0x", ""), "hex"),
      "keccak256"
    );
    return this.formatEthSignature(sig);
  }

  async signStarknetDeployAccountTransactionSelected(
    env: Env,
    origin: string,
    chainId: string,
    signer: string,
    details: DeployAccountSignerDetails
  ): Promise<string[]> {
    return await this.signStarknetDeployAccountTransaction(
      env,
      origin,
      this.keyRingService.selectedVaultId,
      chainId,
      signer,
      details
    );
  }

  async signStarknetDeployAccountTransaction(
    _env: Env,
    _origin: string,
    vaultId: string,
    chainId: string,
    signer: string,
    details: DeployAccountSignerDetails
  ): Promise<string[]> {
    const key = await this.getStarknetKey(vaultId, chainId);
    if (key.hexAddress !== signer) {
      throw new Error("Invalid signer");
    }

    const compiledConstructorCalldata = CallData.compile(
      details.constructorCalldata
    );
    let msgHash;

    if (Object.values(ETransactionVersion2).includes(details.version as any)) {
      const det = details as V2DeployAccountSignerDetails;
      msgHash = starknetHashUtils.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        constructorCalldata: compiledConstructorCalldata,
        version: det.version,
      });
    } else if (
      Object.values(ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3DeployAccountSignerDetails;
      msgHash = starknetHashUtils.calculateDeployAccountTransactionHash({
        ...det,
        salt: det.addressSalt,
        compiledConstructorCalldata,
        version: det.version,
        nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
      });
    } else {
      throw Error("unsupported signDeployAccountTransaction version");
    }

    const sig = await this.keyRingService.sign(
      chainId,
      vaultId,
      Buffer.from(msgHash.replace("0x", ""), "hex"),
      "keccak256"
    );
    return this.formatEthSignature(sig);
  }

  async signStarknetDeclareTransactionSelected(
    env: Env,
    origin: string,
    chainId: string,
    signer: string,
    details: DeclareSignerDetails
  ): Promise<string[]> {
    return await this.signStarknetDeclareTransactionn(
      env,
      origin,
      this.keyRingService.selectedVaultId,
      chainId,
      signer,
      details
    );
  }

  async signStarknetDeclareTransactionn(
    _env: Env,
    _origin: string,
    vaultId: string,
    chainId: string,
    signer: string,
    details: DeclareSignerDetails
  ): Promise<string[]> {
    const key = await this.getStarknetKey(vaultId, chainId);
    if (key.hexAddress !== signer) {
      throw new Error("Invalid signer");
    }

    let msgHash;

    if (Object.values(ETransactionVersion2).includes(details.version as any)) {
      const det = details as V2DeclareSignerDetails;
      msgHash = starknetHashUtils.calculateDeclareTransactionHash({
        ...det,
        version: det.version,
      });
    } else if (
      Object.values(ETransactionVersion3).includes(details.version as any)
    ) {
      const det = details as V3DeclareSignerDetails;
      msgHash = starknetHashUtils.calculateDeclareTransactionHash({
        ...det,
        version: det.version,
        nonceDataAvailabilityMode: intDAM(det.nonceDataAvailabilityMode),
        feeDataAvailabilityMode: intDAM(det.feeDataAvailabilityMode),
      });
    } else {
      throw Error("unsupported signDeclareTransaction version");
    }

    const sig = await this.keyRingService.sign(
      chainId,
      vaultId,
      Buffer.from(msgHash.replace("0x", ""), "hex"),
      "keccak256"
    );
    return this.formatEthSignature(sig);
  }

  protected formatEthSignature(sig: {
    readonly r: Uint8Array;
    readonly s: Uint8Array;
    readonly v: number | null;
  }): string[] {
    if (sig.v == null) {
      throw new Error("Invalid signature");
    }

    const r = new CairoUint256(
      "0x" + Buffer.from(sig.r).toString("hex")
    ).toUint256HexString();
    const s = new CairoUint256(
      "0x" + Buffer.from(sig.s).toString("hex")
    ).toUint256HexString();
    return [r.low, r.high, s.low, s.high, "0x" + sig.v.toString(16)];
  }
}

class SignerInterfaceImpl extends SignerInterface {
  constructor(
    protected readonly ProviderInterface: starknetProvider.Block,
    protected readonly keyRingService: KeyRingService,
    protected readonly service: KeyRingStarknetService
  ) {
    super();
  }

  getPubKey(): Promise<string> {
    return this.service.getStarknetKey(this.keyRingService.selectedVaultId);
  }

  signDeclareTransaction(
    transaction: DeclareSignerDetails
  ): Promise<Signature> {
    return Promise.resolve(undefined);
  }

  signDeployAccountTransaction(
    transaction: DeployAccountSignerDetails
  ): Promise<Signature> {
    return Promise.resolve(undefined);
  }

  signMessage(
    typedData: TypedData,
    accountAddress: string
  ): Promise<Signature> {
    return Promise.resolve(undefined);
  }

  signTransaction(
    transactions: Call[],
    transactionsDetail: InvocationsSignerDetails
  ): Promise<Signature> {
    return Promise.resolve(undefined);
  }
}

const ETransactionVersion2 = {
  V0: "0x0" as const,
  V1: "0x1" as const,
  V2: "0x2" as const,
  F0: "0x100000000000000000000000000000000" as const,
  F1: "0x100000000000000000000000000000001" as const,
  F2: "0x100000000000000000000000000000002" as const,
};

const ETransactionVersion3 = {
  V3: "0x3" as const,
  F3: "0x100000000000000000000000000000003" as const,
};

const EDataAvailabilityMode = {
  L1: "L1" as const,
  L2: "L2" as const,
};

const EDAMode = {
  L1: 0 as const,
  L2: 1 as const,
};

function intDAM(dam: "L1" | "L2"): 0 | 1 {
  if (dam === EDataAvailabilityMode.L1) return EDAMode.L1;
  if (dam === EDataAvailabilityMode.L2) return EDAMode.L2;
  throw Error("EDAM conversion");
}
