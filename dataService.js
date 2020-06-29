const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')
const { pad } = require('./utils')

class DataService {
	timers = {}
	bot = null

  constructor(bot) {
		this.bot = bot
	}

	loadCurrentBTCVolume = async () => {
		const day = pad(new Date().getUTCDate(), 2, '0')
		const month = pad(new Date().getUTCMonth() + 1, 2, '0')
		const url = `https://api.blockchair.com/bitcoin/blocks?a=date,sum(output_total)&q=time(2020-${month}-${day})`
		const response = await fetch(url)
		const body = await response.json()
		return Math.round(body['data'][0]['sum(output_total)'] / 100000000)
	}
	
	calculateForecast = async () => {
		const currentBTCVolume = await this.loadCurrentBTCVolume()
		const now = new Date()
		const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59))
		const minutes = Math.round((24 * 60) - ((today - now) / 1000 / 60))
		const forecast = Math.round((currentBTCVolume / minutes) * (24 * 60))
		return {
			now,
			forecast,
			currentBTCVolume
		}
	}

	renewForecasting() {
		const uids = this.getAllUids()
		uids.forEach(uid => this.startForecasting(uid))
	}

	getAllUids() {
		const files = fs.readdirSync(path.join(process.env.USERS_PATH, 'users'))
		return files.map(file => path.parse(file).name)
	}

	getFilePath(uid) {
		return path.join(process.env.USERS_PATH, 'users', `${uid}.json`)
	}

	registerUser(ctx) {
		const uid = ctx.chat.id
		const file = this.getFilePath(uid)
		if (!fs.existsSync(file)) {
			const data ={
				uid,
				interval: null,
				threshold: null,
				latestForecast: null,
				currentBTCVolume: null,
				forecastExceededNotifiedAt: null,
				volumeExceededNotifiedAt: null
			}
			const text = JSON.stringify(data)
			fs.writeFileSync(file, text)
			return data
		} else {
			const text = fs.readFileSync(file, 'utf8')
			return JSON.parse(text)
		}
	}

	getUserData(uid) {
		const file = this.getFilePath(uid)
		const text = fs.readFileSync(file, 'utf8')
		const data = JSON.parse(text)
		if (data.forecastExceededNotifiedAt) {
			data.forecastExceededNotifiedAt = new Date(Date.parse(data.forecastExceededNotifiedAt))
		}
		if (data.volumeExceededNotifiedAt) {
			data.volumeExceededNotifiedAt = new Date(Date.parse(data.volumeExceededNotifiedAt))
		}
		return data
	}

	updateUserData(uid, data) {
		const file = this.getFilePath(uid)
		const text = JSON.stringify(data)
		fs.writeFileSync(file, text)
	}

	setInterval(uid, value) {
		const user = this.getUserData(uid)
		user.interval = value
		this.updateUserData(uid, user)
		this.startForecasting(uid)
	}

	setThreshold(uid, value) {
		const user = this.getUserData(uid)
		user.threshold = value
		user.forecastExceededNotifiedAt = null
		user.volumeExceededNotifiedAt = null
		this.updateUserData(uid, user)
		this.startForecasting(uid)
	}

	startForecasting(uid) {
		if (this.timers[uid]) {
			clearTimeout(this.timers[uid])
		}

		const user = this.getUserData(uid)

		if (user.threshold) {
			this.calculateForecast().then(({ forecast, currentBTCVolume }) => {
				user.latestForecast = forecast
				user.currentBTCVolume = currentBTCVolume
	
				if (!user.forecastExceededNotifiedAt || user.forecastExceededNotifiedAt.getUTCDay() !== new Date().getUTCDay()) {
					if (user.latestForecast > user.threshold) {
						this.bot.telegram.sendMessage(
							uid,
							`Прогноз *${user.latestForecast}* превысил порог *${user.threshold}*`,
							{
								parse_mode: 'MarkdownV2'
							}
						)
						user.forecastExceededNotifiedAt = new Date().toUTCString()
					}
				}
		
				if (!user.volumeExceededNotifiedAt || user.volumeExceededNotifiedAt.getUTCDay() !== new Date().getUTCDay()) {
					if (user.currentBTCVolume > user.threshold) {
						this.bot.telegram.sendMessage(
							uid,
							`Текущий объем *${user.currentBTCVolume}* превысил порог *${user.threshold}*`,
							{
								parse_mode: 'MarkdownV2'
							}
						)
						user.volumeExceededNotifiedAt = new Date().toUTCString()
					}
				}
		
				this.updateUserData(uid, user)
		
				if (user.interval) {
					this.timers[uid] = setTimeout(() => {
						this.startForecasting(uid)
					}, user.interval * 60 * 1000)
				}
			})
		}
	}
}

module.exports = DataService
