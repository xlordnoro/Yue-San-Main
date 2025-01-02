//Loads the required modules

const { ActivityType } = require("discord.js");

//Creates an array containing the various statuses to display

module.exports = (client) => {
  client.pickPresence = async () => {
    const options = [
      {
        type: ActivityType.Watching,
        text: "Over Hajime while he sleeps soundly next to me.",
        status: "dnd",
      },
      {
        type: ActivityType.Listening,
        text: "A perverted dragon queen as she is mercilessly dragged away for saying too much.",
        status: "online",
      },
      {
        type: ActivityType.Playing,
        text: "With Myu and watching over a certain shameless Valkyrie who is trying to sink her claws into Hajime.",
        status: "online",
      },
    ];

//Uses a math.random function to determine which option to pick for the day and sets the presence.

    const option = Math.floor(Math.random() * options.length);

    client.user.setPresence({
      activities: [
        {
          name: options[option].text,
          type: options[option].type,
        },
      ],
      status: options[option].status,
    });
  };
};
