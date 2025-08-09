//Contains a dummy file so github will process the directory as it will ignore empty directories for some reason...
module.exports = {
    data: {
        name: `movealong`
    },
    async execute(interaction, client) {
        await interaction.reply({
            content: "Just a dummy file. Move along please.",
            ephemeral: true
        });
    }
}