//Loads the required libraries or files to externally load for the command.

const { MessageFlags, SlashCommandBuilder, EmbedBuilder } = require("discord.js");

//Create slash command and display a message containing all of the commands available for Mieru-Nee-Main presently.

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription(
      "Shows a list of the available commands for Yue-San-Main."
    ),
  async execute(interaction, client) {
    const embed = new EmbedBuilder()
      .setTitle(`Available Commands`)
      .setDescription(
        `**Normal Commands:**\n\n **/help** Displays the command list.\n\n **/ping** Displays the ping latency between the API and the user.\n\n **/checkbook_indigo** Checks the in-stock availability of books on indigo.`
      )
      .setColor('#c70000');

    await interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
