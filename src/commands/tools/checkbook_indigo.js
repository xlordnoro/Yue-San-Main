const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(`${__dirname}/../../json/userBooks.json`);

// Load or initialize the JSON file
function loadUserBooks() {
  if (fs.existsSync(dataFilePath)) {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(data);
  }
  return {};
}

function saveUserBooks(data) {
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf8');
}

// Load user books at startup
const userBooks = loadUserBooks();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkbook_indigov2')
    .setDescription('Manage and check the stock availability of books on Indigo.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Adds a book to your tracked list.')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('The title of the book to add')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Removes a book from your tracked list.')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('The title of the book to remove')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('Lists all the books you are tracking.'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Checks the stock availability of a book by its title.')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('The title of the book to check')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('check_all')
        .setDescription('Checks the stock availability for all books in your tracked list.')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Initialize the user's book list if it doesn't exist
    if (!userBooks[userId]) {
      userBooks[userId] = [];
    }
    const trackedBooks = userBooks[userId];

    if (subcommand === 'add') {
      const bookTitle = interaction.options.getString('title');
      if (trackedBooks.includes(bookTitle)) {
        return await interaction.reply({
          content: `📚 **${bookTitle}** is already in your tracked list.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      trackedBooks.push(bookTitle);
      saveUserBooks(userBooks); // Save changes to the file
      return await interaction.reply({
        content: `✅ **${bookTitle}** has been added to your tracked list.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'remove') {
      const bookTitle = interaction.options.getString('title');
      const bookIndex = trackedBooks.indexOf(bookTitle);
      if (bookIndex === -1) {
        return await interaction.reply({
          content: `❌ **${bookTitle}** is not in your tracked list.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      trackedBooks.splice(bookIndex, 1);
      saveUserBooks(userBooks); // Save changes to the file
      return await interaction.reply({
        content: `✅ **${bookTitle}** has been removed from your tracked list.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'list') {
      if (trackedBooks.length === 0) {
        return await interaction.reply({
          content: '📚 Your tracked list is empty.',
          flags: MessageFlags.Ephemeral,
        });
      }

      const bookList = trackedBooks.map((book, index) => `${index + 1}. ${book}`).join('\n');
      return await interaction.reply({
        content: `📚 **${interaction.user.username}'s Tracked Books:**\n${bookList}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'check') {
      const bookTitle = interaction.options.getString('title');
      const searchUrl = `https://www.indigo.ca/en-ca/search/?keywords=${encodeURIComponent(bookTitle)}`;

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      // Set a realistic user agent
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      );

      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });

        // Find the first search result matching the title (looser match)
        const bookPageUrl = await page.evaluate((title) => {
          const links = Array.from(document.querySelectorAll('a.link.secondary h3')); // Select all relevant h3 tags
          const matchingLink = links.find(link =>
            link.textContent.trim().toLowerCase().includes(title.toLowerCase()) // Looser substring match
          );
          return matchingLink ? matchingLink.closest('a').href : null; // Get the href from the closest <a>
        }, bookTitle);

        if (!bookPageUrl) {
          await browser.close();
          return await interaction.editReply({
            content: `❌ No results found for "${bookTitle}". Please check the title and try again.`,
            flags: MessageFlags.Ephemeral,
          });
        }

        // Navigate to the book's page
        await page.goto(bookPageUrl, { waitUntil: 'domcontentloaded' });

        // Wait for the Paperback option and click it
        await page.waitForSelector('span.format-value.block-value.swatch-value.selected.selectable', { visible: true });
        await page.click('span.format-value.block-value.swatch-value.selectable[data-attr-value="TP"]');

        await new Promise(r => setTimeout(r, 2000)); // 2-second delay

        // Extract stock information
        const stockStatus = await page.evaluate(() => {
          const notifyMeElement = document.querySelector('p.delivery-option-details.notify-me');
          if (notifyMeElement) {
            const text = notifyMeElement.textContent.trim();
            if (text === 'Out of stock online') {
              return { available: false, shippingDelay: false, preOrder: false };
            } else if (text.startsWith('Ships within')) {
              const weeksMatch = text.match(/Ships within (\d+)-(\d+) weeks/);
              const monthsMatch = text.match(/Ships within (\d+)-(\d+) months/);
              if (weeksMatch) {
                return {
                  available: true,
                  shippingDelay: true,
                  duration: `${weeksMatch[1]}-${weeksMatch[2]} weeks`,
                  preOrder: false,
                };
              } else if (monthsMatch) {
                return {
                  available: true,
                  shippingDelay: true,
                  duration: `${monthsMatch[1]}-${monthsMatch[2]} months`,
                  preOrder: false,
                };
              }
            } else if (text === 'Pre-order online') {
              return { available: true, shippingDelay: false, preOrder: true };
            }
            return { available: true, shippingDelay: false, preOrder: false };
          }
        
          const stockElement = document.querySelector('p.delivery-option-details.mouse span:nth-child(2)');
          if (stockElement) {
            const preOrderMatch = stockElement.textContent.includes('Pre-order online');
            const inStockMatch = stockElement.textContent.match(/In stock online|Ships within (\d+)-(\d+) weeks|Ships within (\d+)-(\d+) months/);
            if (preOrderMatch) {
              return { available: true, shippingDelay: false, preOrder: true };
            } else if (inStockMatch) {
              return {
                available: true,
                shippingDelay: inStockMatch[0].includes('Ships within'),
                duration: inStockMatch[1] ? `${inStockMatch[1]}-${inStockMatch[2]} weeks` : `${inStockMatch[3]}-${inStockMatch[4]} months`,
                preOrder: false,
              };
            }
          }
      
          return { available: false, shippingDelay: false, preOrder: false };
        });

        const responseMessage = stockStatus.available
          ? stockStatus.preOrder
            ? `📦 **${bookTitle}** is available for pre-order online.`
            : stockStatus.shippingDelay
            ? `✅ **${bookTitle}** is available for purchase online or in-store, but with a shipping delay of **${stockStatus.duration}**.`
            : `✅ **${bookTitle}** is available for purchase online or in-store.`
          : `❌ **${bookTitle}** is out of stock online.`;

        await interaction.editReply({ content: responseMessage, flags: MessageFlags.Ephemeral });
      } catch (error) {
        console.error('Error checking book stock:', error);
        await interaction.editReply({
          content: '❌ An error occurred while checking the book stock. Please try again later.',
          flags: MessageFlags.Ephemeral,
        });
      } finally {
        await browser.close();
      }
    }

    if (subcommand === 'check_all') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const browser = await puppeteer.launch({ headless: true });
      const allResults = [];

      try {
        for (const bookTitle of trackedBooks) {
          const searchUrl = `https://www.indigo.ca/en-ca/search/?keywords=${encodeURIComponent(bookTitle)}`;
          const page = await browser.newPage();

          await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
          );

          await page.goto(searchUrl, { waitUntil: 'networkidle2' });

          const bookPageUrl = await page.evaluate((title) => {
            const links = Array.from(document.querySelectorAll('a.link.secondary h3'));
            const matchingLink = links.find(link =>
              link.textContent.trim().toLowerCase().includes(title.toLowerCase())
            );
            return matchingLink ? matchingLink.closest('a').href : null;
          }, bookTitle);

          if (!bookPageUrl) {
            allResults.push(`❌ No results found for **${bookTitle}**.`);
            await page.close();
            continue;
          }

          await page.goto(bookPageUrl, { waitUntil: 'domcontentloaded' });

          await page.waitForSelector('span.format-value.block-value.swatch-value.selected.selectable', { visible: true });
          await page.click('span.format-value.block-value.swatch-value.selectable[data-attr-value="TP"]');

          await new Promise(r => setTimeout(r, 2000));

          const stockStatus = await page.evaluate(() => {
            const notifyMeElement = document.querySelector('p.delivery-option-details.notify-me');
            if (notifyMeElement) {
              const text = notifyMeElement.textContent.trim();
              if (text === 'Out of stock online') {
                return { available: false, shippingDelay: false, preOrder: false };
              } else if (text.startsWith('Ships within')) {
                const weeksMatch = text.match(/Ships within (\d+)-(\d+) weeks/);
                const monthsMatch = text.match(/Ships within (\d+)-(\d+) months/);
                if (weeksMatch) {
                  return {
                    available: true,
                    shippingDelay: true,
                    duration: `${weeksMatch[1]}-${weeksMatch[2]} weeks`,
                    preOrder: false,
                  };
                } else if (monthsMatch) {
                  return {
                    available: true,
                    shippingDelay: true,
                    duration: `${monthsMatch[1]}-${monthsMatch[2]} months`,
                    preOrder: false,
                  };
                }
              } else if (text === 'Pre-order online') {
                return { available: true, shippingDelay: false, preOrder: true };
              }
              return { available: true, shippingDelay: false, preOrder: false };
            }
          
            const stockElement = document.querySelector('p.delivery-option-details.mouse span:nth-child(2)');
            if (stockElement) {
              const preOrderMatch = stockElement.textContent.includes('Pre-order online');
              const inStockMatch = stockElement.textContent.match(/In stock online|Ships within (\d+)-(\d+) weeks|Ships within (\d+)-(\d+) months/);
              if (preOrderMatch) {
                return { available: true, shippingDelay: false, preOrder: true };
              } else if (inStockMatch) {
                return {
                  available: true,
                  shippingDelay: inStockMatch[0].includes('Ships within'),
                  duration: inStockMatch[1] ? `${inStockMatch[1]}-${inStockMatch[2]} weeks` : `${inStockMatch[3]}-${inStockMatch[4]} months`,
                  preOrder: false,
                };
              }
            }
        
            return { available: false, shippingDelay: false, preOrder: false };
          });

          const resultMessage = stockStatus.available
            ? stockStatus.preOrder
              ? `📦 **${bookTitle}** is available for pre-order online.`
              : stockStatus.shippingDelay
              ? `✅ **${bookTitle}** is available for purchase online or in-store, but with a shipping delay of **${stockStatus.duration}**.`
              : `✅ **${bookTitle}** is available for purchase online or in-store.`
            : `❌ **${bookTitle}** is out of stock online.`;

          allResults.push(resultMessage);
          await page.close();
        }

        await interaction.editReply({ content: allResults.join('\n'), flags: MessageFlags.Ephemeral });
      } catch (error) {
        console.error('Error checking all book stocks:', error);
        await interaction.editReply({
          content: '❌ An error occurred while checking the book stocks. Please try again later.',
          flags: MessageFlags.Ephemeral,
        });
      } finally {
        await browser.close();
      }
    }
  },
};