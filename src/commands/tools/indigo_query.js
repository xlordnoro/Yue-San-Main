const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const puppeteer = require('puppeteer');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkbook_indigo')
    .setDescription('Checks the stock availability of a book by its title on Indigo.')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('The title of the book to check')
        .setRequired(true)),

  async execute(interaction) {
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

      // Original method below: I changed it to a selector array as some of the novels on indigo only have paperback 
      // and the selector element is different than 2 formats in a single page.
      
      //await page.waitForSelector('span.format-value.block-value.swatch-value.selected.selectable', { visible: true });
      //await page.click('span.format-value.block-value.swatch-value.selectable[data-attr-value="TP"]');

      const selectors = [
            'span.format-value.block-value.swatch-value.selectable[data-attr-value="TP"]',
            'span.format-value.block-value.swatch-value.selected'
        ];

      for (const selector of selectors) {
        const element = await page.$(selector);
        if (element) {
            await page.click(selector);
            break; // Stop after first successful click
        }
      }

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
  },
};