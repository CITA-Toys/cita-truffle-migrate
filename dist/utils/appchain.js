const utf8 = require('utf8')
const AppChain = require('@cryptape/cita-sdk').default
const log = require('./log').title('utils/appchain')

const fromUtf8 = function(str) {
  str = utf8.encode(str)
  let hex = ''
  const size = str.length
  for (let i = 0; i < size; i++) {
    const code = str.charCodeAt(i)
    if (code === 0) {
      break
    }
    const n = code.toString(16)
    hex += n.length < 2 ? '0' + n : n
  }

  return hex
}

const addressFromPrivateKey = (privateKey, appchainInstance = null) => {
  let appchain = appchainInstance
  if (appchain === null) {
    appchain = AppChain()
  }
  const account = appchain.base.accounts.privateKeyToAccount(privateKey)
  const address = account.address.toLocaleLowerCase().slice(2)
  return address
}

const currentValidUntilBlock = (appchain, blocknumberAdd = 88) => {
  // log('currentValidUntilBlock')
  return appchain.base
    .getBlockNumber()
    .then((number) => {
      const num = Number(number) + Number(blocknumberAdd)
      return num
    })
    .catch((err) => {
      throw new Error('currentValidUntilBlock failed\n' + err)
    })
}

const sendDeployContract = (contract, data, contractArguments, txParams) => {
  return contract
    .deploy({ data, arguments: contractArguments })
    .send(txParams)
    .catch((err) => {
      throw new Error('sendDeployContract failed\n' + err)
    })
}

const deployContract = (appchain, contract, data, args, txParams) => {
  const { privateKey, from, nonce, quota, chainId, version, validUntilBlock, value } = txParams
  const tx = { privateKey, from, nonce, quota, chainId, version, validUntilBlock, value }
  return appchain.base.getMetaData().then((meta)=>{
    tx.version = meta.version;
    if (tx.validUntilBlock === undefined) {
      return currentValidUntilBlock(appchain)
        .then((number) => {
          tx.validUntilBlock = number
        })
        .then(() => {
          return sendDeployContract(contract, data, args, tx)
        })
    } else {
      return sendDeployContract(contract, data, args, tx)
    }
  })
  
}

const storeAbi = (appchain, contractAddress, abi, txParams) => {
  let abibytes = fromUtf8(JSON.stringify(abi))
  // const address = res.contractAddress
  const data = contractAddress + abibytes
  const { validUntilBlock, chainId, nonce, version, quota, privateKey, from, value } = txParams
  // 存 abi 的固定地址
  const to = 'ffffffffffffffffffffffffffffffffff010001'
  const tx = {
    from,
    to,
    quota,
    version,
    nonce,
    data,
    validUntilBlock,
    chainId,
    privateKey,
    value,
  }
  if (tx.validUntilBlock === undefined) {
    return currentValidUntilBlock(appchain)
      .then((number) => {
        tx.validUntilBlock = number
      })
      .then(() => {
        return appchain.base.sendTransaction(tx)
      })
  }
  // log('storing abi...')
  return appchain.base.sendTransaction(tx)
}

const storeAbiCheck = (appchain, contractAddress, abi, txParams, success, failure) => {
  return storeAbi(appchain, contractAddress, abi, txParams)
    .then((res) => {
      return pollingReceipt(appchain, res.hash)
    })
    .then((res) => {
      let err = res.errorMessage
      if (err !== null) {
        throw err
      }
      return appchain.base.getMetaData().then((meta)=>{
        let state = 'latest'
        if(meta.version >= 1){
          state = 'pending'
        }
        return appchain.base.getAbi(contractAddress,state)  // CITA 0.20  new feature, get the latest block can not mark block as ‘latest’, but ‘pending
      })
    })
    .then((abi) => {
      if (abi === '0x') {
        const err = failure || 'store abi failure'
        console.log(err)
        throw 'store abi failure'
      } else {
        const ok = success || 'store abi success'
        console.log(ok)
      }
    })
}

const pollingReceipt = (appchain, hash) => {
  // log('pollingReceipt hash:', hash)
  let remain = 20
  const p = new Promise((resolve, reject) => {
    const func = () => {
      appchain.base
        .getTransactionReceipt(hash)
        .then((receipt) => {
          remain--
          // log(remain)
          if (receipt) {
            // log('pollingReceipt done')
            resolve(receipt)
          } else if (remain < 0) {
            reject('fetch transaction receipt overtime')
          } else {
            setTimeout(func, 1000)
          }
        })
        .catch((err) => {
          reject(err)
        })
    }
    func()
  })
  return p
}

const fetchedChainId = (appchain) => {
  return appchain.base.getMetaData().then((res) => {
    return res.chainIdV1 || res.chainId
  })
}

module.exports = {
  fromUtf8,
  addressFromPrivateKey,
  currentValidUntilBlock,
  deployContract,
  storeAbi,
  storeAbiCheck,
  pollingReceipt,
  fetchedChainId,
}
