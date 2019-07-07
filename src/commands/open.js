const { Command, flags } = require('@oclif/command')
const { cli } = require('cli-ux')
const assert = require('assert')
const { Channel, Identity, MerkleTree, splitSig } = require('adex-protocol-eth/js')
const coreABI = require('adex-protocol-eth/abi/AdExCore')
const crypto = require('crypto')
const { Interface } = require('ethers').utils
const Web3 = require('web3')
const testnet = `${process.env.INFURA_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
var web3 = new Web3(new Web3.providers.HttpProvider(testnet))
const MongoClient = require('mongodb').MongoClient;
const uri = "mongodb+srv://" + process.env.DB_USER + ":" + process.env.DB_PASS + "@cluster0-oshqk.mongodb.net/test?retryWrites=true&w=majority";
const solc = require('solc')
const fs = require('fs')
const { privateToAddress, bufferToHex } = require('ethereumjs-util')
var wallet
var identity
var privateKey
var password
require('dotenv').config()

function validURL(str) {
  var pattern = new RegExp('^(https?:\\/\\/)?' + // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
    '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator
  return !!pattern.test(str);
}

function toEthereumChannel(channel) {
  const specHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(channel.spec))
    .digest()
  return new Channel({
    creator: channel.creator,
    tokenAddr: channel.tokenAddr,
    tokenAmount: channel.tokenAmount,
    validUntil: channel.validUntil,
    validators: channel.spec.validators.map(v => v.id),
    spec: specHash
  })
}

function deployIdentity(creator) {
  var input = {
    language: 'Solidity',
    sources: {
      'Identity.sol': {
        content: fs.readFileSync("adex-protocol-eth/contracts/Identity.sol", "utf8")
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['*']
        }
      }
    }
  }

  var output = JSON.parse(solc.compile(JSON.stringify(input)))
  let abi = output.contracts["Identity.sol"]["Idenity"].abi
  let code = "0x" + output.contracts["Identity.sol"]["Identity"].evm.bytecode.object

  identity = web3.eth.Contract(abi)

  web3.personal.unlockAccount(ethChannel.creator, password, 1000, e => {this.log(e)})

  let gasPrice = 0
  web3.eth.getGasPrice().then((averageGasPrice) => {gasPrice = averageGasPrice}).catch(console.error)

  let gas = 0
  identity.deploy({ data: code, arguments: [[ethChannel.creator], [3]] }).estimateGas().then((estimatedGas) => {
    gas = estimatedGas;
  }).catch(console.error);

  let address = identity.deploy({ data: code, arguments: [[ethChannel.creator], [3]] }).send({ gas: gas, gasPrice: gasPrice, from: wallet }).then(instance => {instance.options.address})
  return address
}

function submit(channel) {
  const ethChannel = toEthereumChannel(channel)
  const coreInterface = new Interface(coreABI)

  const open = coreInterface.functions.channelOpen.encode([ethChannel.toSolidityTuple()])

  const client = new MongoClient(uri, { useNewUrlParser: true });

  var identityAddr = null

  var nonce = 0

  client.connect(err => {
    const collection = client.db("adexcli").collection("identities");
    collection.find({}).toArray(function (err, docs) {
      assert.equal(err, null, "Error: Could not retireve Identities from mongodb.");
      for (let doc in docs) {
        for (let addr in docs[doc].addrs) {
          if (addr == ethChannel.creator) {
            identityAddr = addr
            nonce = docs[doc].nonce + 1
          }
        }
      }
      if (identityAddr == null) {
        const deployedIdentityAddr = deployIdentity(ethChannel.creator)
        collection.insert({ addr: deployedIdentityAddr, addrs: [ethChannel.creator], privLevels: [3], nonce: 0 }, function (err, result) {
          assert.equal(err, null, "Error: Could not add new Identity to mongodb.")
          assert.equal(1, result.result.n, "Error: mongodb could not execute your query properly.")
          assert.equal(1, result.ops.length, "Error: mongodb could not execute your query properly.")
        })
        identityAddr = deployedIdentityAddr
      }
    })
    client.close()
  })

  web3.personal.unlockAccount(ethChannel.creator, password, 1000, e => {this.log(e)})

  identity.executeBySender([Identity.Transaction({
    identityContract: identityAddr,
    nonce: nonce,
    feeTokenAddr: ethChannel.tokenAddr,
    feeAmount: ethChannel.tokenAmount,
    to: process.env.ADEX_CORE,
    value: 0,
    data: open
  }).toSolidityTuple()]).call({from: wallet})

  client.connect(err => {
    collection.updateOne({ addr: ethChannel.creator },
      {$set: {nonce: nonce}}, function(err, result) {
        assert.equal(err, null, "Error: Could not update nonce in mongodb.");
        assert.equal(1, result.result.n, "Error: mongodb could not execute your query properly.");
      })
    client.close()
  })

  console.log("Successfully opened channel.")

}

class OpenCommand extends Command {
  async run() {
    const { flags } = this.parse(OpenCommand)

    let creator = await cli.prompt('Please input your wallet (creator) address (including the "0x" appendix)')

    while (!web3.utils.isAddress(creator)) {
      this.log('Error: Invalid address.')
      creator = await cli.prompt('Please input your wallet (creator) address (including the "0x" appendix)')
    }

    privateKey = await cli.prompt('Please input your wallet private key (excluding the "0x" appendix"). Note: your PK is not stored, but it is needed to sign transactions.')

    while (creator !== bufferToHex(privateToAddress(new Buffer(privateKey, 'hex')))) {
      this.log('Error: Invalid private key.')
      privateKey = await cli.prompt('Please input your wallet private key (excluding the "0x" appendix"). Note: your PK is not stored, but it is needed to sign transactions.')
    }

    password = await cli.prompt('Please input your wallet password. Note: your password is not stored, but it is needed to unlock your wallet.')
    let err = false
    web3.personal.unlockAccount(creator, password, 1000, e => {if (e) err = true})

    while (err) {
      this.log('Error: Invalid private key.')
      password = await cli.prompt('Please input your wallet password. Note: your password is not stored, but it is needed to unlock your wallet.')
      err = false
      web3.personal.unlockAccount(creator, password, 1000, e => {if (e) err = true})
    }
    
    try {
      wallet = web3.eth.personal.importRawKey(privateKey, password)
    } catch (e) {
      this.log(e)
      return
    }

    let tokenAddr = await cli.prompt('Please input your ERC20 token (payment method) address')

    while (!web3.utils.isAddress(tokenAddr)) {
      this.log('Error: Invalid address.')
      tokenAddr = await cli.prompt('Please input your ERC20 token (payment method) address')
    }

    let tokenAmount = await cli.prompt('Please input your desired funding amount')
    while (isNaN(tokenAmount)) {
      this.log('Error: Not a number.')
      tokenAmount = await cli.prompt('Please input your desired funding amount')
    }

    let validUntil = await cli.prompt('Please input your expiration date for the channel (mm/dd/yyyy)')
    while (!/\d\d\/\d\d\/\d\d\d\d/.test(validUntil) || new Date(validUntil) <= new Date()) {
      this.log('Error: Invalid format or time.')
      validUntil = await cli.prompt('Please input your expiration date for the channel (mm/dd/yyyy)')
    }

    validUntil = Math.floor(new Date(validUntil).getTime() / 1000)

    let validatorsCount = await cli.prompt('Please input the desired number of validators')
    while (isNaN(validatorsCount)) {
      this.log('Error: Not a number.')
      validatorsCount = await cli.prompt('Please input the desired number of validators')
    }

    let validators = []

    for (let i = 0; i < validatorsCount; i++) {

      validators[i] = {}
      validators[i].id = await cli.prompt('Please input the address of validator no. ' + (i + 1))
      while (!web3.utils.isAddress(validators[i].id)) {
        this.log('Error: Invalid address.')
        validators[i].id = await cli.prompt('Please input the address of validator no. ' + (i + 1))
      }

      validators[i].url = await cli.prompt('Please input the url of validator no. ' + (i + 1))
      while (!validURL(validators[i].url)) {
        this.log('Error: Invalid url.')
        validators[i].url = await cli.prompt('Please input the url of validator no. ' + (i + 1))
      }

      validators[i].fee = await cli.prompt('Please input the fee of validator no. ' + (i + 1))
      while (isNaN(validators[i].fee)) {
        this.log('Error: Not a number.')
        validators[i].fee = await cli.prompt('Please input the fee of validator no. ' + (i + 1))
      }

    }

    let spec = {}

    spec.minPerImpression = await cli.prompt("Please input the minimum amount to pay for an impression")
    while (isNaN(spec.minPerImpression)) {
      this.log("Error: Not a number")
      spec.minPerImpression = await cli.prompt("Please input the minimum amount to pay for an impression")
    }

    spec.validators = validators

    submit({
      creator: creator,
      tokenAddr: tokenAddr,
      tokenAmount: (tokenAmount * 10 ** 18).toString(),
      validUntil: validUntil,
      spec: spec
    })

  }
}

OpenCommand.description = `Opens a new OUTPACE channel`

OpenCommand.flags = {
  name: flags.string({ char: 'n', description: 'name to print' })
}

module.exports = OpenCommand
