const {Command, flags} = require('@oclif/command')

class HelloCommand extends Command {
  async run() {
    const {flags} = this.parse(HelloCommand)
    const name = flags.name || 'world'
    this.log(`Hello ${name} from AdEx CLI!`)
  }
}

HelloCommand.description = `A welcome from the AdEx CLI.
`

HelloCommand.flags = {
  name: flags.string({char: 'n', description: 'name to print'}),
}

module.exports = HelloCommand
