const dotenv = require('dotenv')
const Telegraf = require('telegraf')
const Extra = require('telegraf/extra')
const Markup = require('telegraf/markup')
const session = require('telegraf/session')
const { declOfNum } = require('./utils')
const DataService = require('./dataService')

dotenv.config()

const bot = new Telegraf(process.env.BOT_TOKEN)
const dataService = new DataService(bot)

dataService.renewForecasting()

const buttons = Markup.inlineKeyboard([
  Markup.callbackButton('Порог', 'threshold'),
  Markup.callbackButton('Интервал', 'interval')
])

const cancelWaiting = Markup.inlineKeyboard([
  Markup.callbackButton('Отмена', 'cancelWaiting')
])

bot.use(session())

bot.use((ctx, next) => {
  ctx.session.user = dataService.registerUser(ctx)
  return next()
})

/* command */

bot.command('start', ({ reply }, next) => {
  reply('Что ж, начинать?')
  setTimeout(() => {
    reply('Для начала укажите порог и интервал обновлений')
  }, 1000)
})

bot.command('settings', ({ reply }) => {
  reply('Что Вы хотите изменить?', Extra.markup(buttons))
})

bot.command('forecast', async ({ replyWithMarkdown }) => {
  const {
    now,
    forecast,
    currentBTCVolume
  } = await dataService.calculateForecast()

  replyWithMarkdown(
    `Дата: *${now.toUTCString()}*\n` +
    `Прогноз: *${forecast}* BTC\n` +
    `Текущий объем: *${currentBTCVolume}* BTC`
  )
})

/* actions */

bot.action('threshold', (ctx, next) => {
  ctx.session.waitingInput = 'threshold'
  return ctx.reply('Введите порог:', Extra.markup(cancelWaiting)).then(() => next())
})

bot.action('interval', (ctx, next) => {
  ctx.session.waitingInput = 'interval'
  return ctx.reply('Введите интервал в минутах:', Extra.markup(cancelWaiting)).then(() => next())
})

bot.action('cancelWaiting', (ctx, next) => {
  if (ctx.session.waitingInput) {
    ctx.session.waitingInput = null
    return ctx.reply('Ну нет - так нет.').then(() => next())
  } else {
    return ctx.reply('А я ничего и не спрашивал.').then(() => next())
  }
})

/* hears */

bot.hears(/(.*)/, ({ match, reply, session, replyWithMarkdown }, next) => {
  const value = parseInt(match[1])

  if (session.waitingInput === 'threshold') {
    if (isNaN(value)) {
      return reply(`Порог должен быть числом! Попробуйте еще:`, Extra.markup(cancelWaiting))
    } else {
      session.waitingInput = null
      dataService.setThreshold(session.user.uid, value)
      return replyWithMarkdown(`Принято!\nНовый порог *${value}* BTC`)
    }
  }
  
  if (session.waitingInput === 'interval') {
    if (isNaN(value)) {
      return reply(`Интервал должен быть числом! Попробуйте еще:`, Extra.markup(cancelWaiting))
    } if (value === 0) {
      return reply(`Мы так сервера заспамим! Попробуйте еще:`, Extra.markup(cancelWaiting))
    } else {
      session.waitingInput = null
      dataService.setInterval(session.user.uid, value)
      return replyWithMarkdown(`Принято!\nБудем запрашивать информацию каждые *${value}* ${declOfNum(value, ['минут', 'минуты', 'минут'])}`)
    }
  }

  return next()
})

bot.hears(/Прогноз/, async ({ replyWithMarkdown }) => {
  const {
    now,
    forecast,
    currentBTCVolume
  } = await dataService.calculateForecast()

  return replyWithMarkdown(
    `Дата: *${now.toUTCString()}*\n` +
    `Прогноз: *${forecast}* BTC\n` +
    `Текущий объем: *${currentBTCVolume}* BTC`
  )
})

bot.hears(/Порог (.+)/, ({ match, reply, session, replyWithMarkdown }) => {
  const value = parseInt(match[1])
  if (isNaN(value)) {
    return reply('Порог должен быть числом!')
  } else {
    session.waitingInput = null
    dataService.setThreshold(session.user.uid, value)
    return replyWithMarkdown(`Принято!\nНовый порог *${value}* BTC`)
  }
})

bot.hears(/Интервал (.+)/, ({ match, reply, session, replyWithMarkdown }) => {
  const value = parseInt(match[1])
  if (isNaN(value)) {
    return reply('Интервал должен быть числом!')
  } if (value === 0) {
    return reply('Мы так сервера заспамим!')
  } else {
    session.waitingInput = null
    dataService.setInterval(session.user.uid, value)
    return replyWithMarkdown(`Принято!\nБудем запрашивать информацию каждые *${value}* ${declOfNum(value, ['минут', 'минуты', 'минут'])}`)
  }
})

bot.hears(/(.*)/, ({ reply }) => reply('Не понимаю, о чем речь 😟'))

// bot.launch()

module.exports = bot