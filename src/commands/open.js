const {Command, flags} = require('@oclif/command')
const {cli} = require('cli-ux')
const fetch = require('node-fetch')
const assert = require('assert')
const { Channel, MerkleTree, splitSig } = require('adex-protocol-eth/js')
const coreABI = require('adex-protocol-eth/abi/AdExCore')
const crypto = require('crypto')
const { Interface } = require('ethers').utils
const Web3 = require('web3')
const testnet = `${process.env.INFURA_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
const web3 = new Web3( new Web3.providers.HttpProvider(testnet) )

// const adapter = require('./adapters/ethereum')
// const { genImpressions } = require('./test/lib')
require('dotenv').config()

function validURL(str) {
  var pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
    '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
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

function submit(channel){
  const ethChannel = toEthereumChannel(channel)
  const coreInterface = new Interface(coreABI)

  const open = coreInterface.functions.channelOpen.encode([ethChannel.toSolidityTuple()])
  console.log(open)

  

}

class OpenCommand extends Command {
  async run() {
    const {flags} = this.parse(OpenCommand)
    
    let creator = await cli.prompt('Please input your wallet (creator) address')

    while (!web3.utils.isAddress(creator)){
      this.log('Error: Invalid address.')
      creator = await cli.prompt('Please input your wallet (creator) address')
    }
    
    let tokenAddr = await cli.prompt('Please input your ERC20 token (payment method) address')

    while (!web3.utils.isAddress(tokenAddr)){
      this.log('Error: Invalid address.')
      tokenAddr = await cli.prompt('Please input your ERC20 token (payment method) address')
    }

    let tokenAmount = await cli.prompt('Please input your desired funding amount')
    while (isNaN(tokenAmount)){
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
    while (isNaN(validatorsCount)){
      this.log('Error: Not a number.')
      validatorsCount = await cli.prompt('Please input the desired number of validators')
    }

    let validators = []

    for (let i = 0; i < validatorsCount; i++){

      validators[i] = {}
      validators[i].id = await cli.prompt('Please input the address of validator no. ' + (i + 1))
      while (!web3.utils.isAddress(validators[i].id)){
        this.log('Error: Invalid address.')
        validators[i].id = await cli.prompt('Please input the address of validator no. ' + (i + 1))
      }

      validators[i].url = await cli.prompt('Please input the url of validator no. ' + (i + 1))
      while (!validURL(validators[i].url)){
        this.log('Error: Invalid url.')
        validators[i].url = await cli.prompt('Please input the url of validator no. ' + (i + 1))
      }

      validators[i].fee = await cli.prompt('Please input the fee of validator no. ' + (i + 1))
      while(isNaN(validators[i].fee)){
        this.log('Error: Not a number.')
        validators[i].fee = await cli.prompt('Please input the fee of validator no. ' + (i + 1))
      }

    }

    let spec = {}

    spec.minPerImpression = await cli.prompt("Please input the minimum amount to pay for an impression")
    while(isNaN(spec.minPerImpression)){
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
  name: flags.string({char: 'n', description: 'name to print'})
}

module.exports = OpenCommand
