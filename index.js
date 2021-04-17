const { Telegraf, Markup } = require('telegraf');
const bot = new Telegraf('telegram token');
const rq = require('request-promise');
const users = require('./users.json');
const fs = require("fs");
const CronJob = require("cron").CronJob;
const appid = "openweathermap.org token ";
const jobs = {};
//this function runs jobs after code reload 
(function () {
	for (let key in users) {
		if (users[key].notifications.isOn) {
			jobs[key] = new CronJob({cronTime: users[key].notifications.settings.time, onTick: eval(users[key].notifications.settings.onTick), utcOffset: users[key].notifications.settings.utcOffset});
			jobs[key].start();
		}
	}
}());

function User(id) {
	this.id = id;
	this.city = "Moscow";
	this.country = "RUS";
	this.lat = 55.7522;
	this.lon = 37.6155;
	this.notifications = {isOn: false, settings: null};
	this.timezone = 10800;
}

function windDirection(degrees) {
	let diff = [360];
	const directions = new Map();
	directions.set(0, "север")
	.set(360, "север")
	.set(45, "северо-восток")
	.set(90, "восток")
	.set(135, "юго-восток")
	.set(180, "юг")
	.set(225, "юго-запад")
	.set(270, "запад")
	.set(315, "северо-запад");
	for(let keys of directions.keys()) {
		if(Math.abs(keys - degrees) < diff[0]) {diff[1] = directions.get(keys); diff[0] = Math.abs(keys - degrees);}
	}
	return diff[1];
}

function ntf(user) {
	if (!user.notifications.isOn) {
		user.notifications.isOn = true;
		user.notifications.settings = {
			time: "00 00 12 * * *",
			onTick: `() => {
				sendWeather(${JSON.stringify(user)}).then(res => bot.telegram.sendMessage(${user.id}, res));
			}`,
			utcOffset: user.timezone / 3600
		};
		jobs[user.id] = new CronJob({cronTime: user.notifications.settings.time, onTick: eval(user.notifications.settings.onTick), utcOffset: user.notifications.settings.utcOffset});
		jobs[user.id].start();
		return 'notifications are on now';
	} else {
		user.notifications.isOn = false;
		jobs[user.id].stop();
		return 'notifications are off now'; 
	}
}
/* TODO: fix bugs with timezones
function getSun(unixTimeStamp, timezone) {
	const date = new Date(unixTimeStamp * 1000);
	let minutes = `0${date.getUTCMinutes()}`.slice(-2);
	let hours = `0${date.setHours(date.getUTCHours() + timezone / 3600)}`.slice(-2);
	return `${hours}:${minutes}`;
\\\
├Восход: ${getSun(res.sys.sunrise, res.timezone)}
└Закат: ${getSun(res.sys.sunset, res.timezone)
\\\

}*/

async function sendWeather(user) {
	let tempStr;
	rq({method: "GET", uri: "http://api.openweathermap.org/data/2.5/weather", qs: {
		lat: user.lat,
		lon: user.lon,
		appid,
		lang: "ru",
		units: "metric"
	}}).then(res => {
		res = JSON.parse(res);
		tempStr = `Погода в городе ${res.name}:
├Погода: ${res.weather[0].description}
├Температура: ${res.main.temp} C°
├Давление: ${res.main.pressure} гПа
├Влажность: ${res.main.humidity} %
├Ветер:
	     ├Скорость: ${res.wind.speed} м/с
	     └Направление: ${windDirection(res.wind.deg)}
└Облачность: ${res.clouds.all} %`;
});

	let promise = new Promise((resolve, reject) => {
		setTimeout(() => resolve(tempStr), 2000);
	});
	return await promise;
}

bot.hears('/start', ctx => {
	if (users[ctx.from.id]) {
		return ctx.reply('Чтобы побольше узнать о боте пропишите /about');
	} else {
		users[ctx.from.id] = new User(ctx.from.id);
		return ctx.reply("В следующем сообщении пропишите /city ВАШГОРОД~КОДСТРАНЫ(в соответствии с ISO 3166) ex: /city Москва~RUS\nПо умолчанию ваш город - Москва");
	}
});

bot.hears('/about', ctx => {
	ctx.reply(`Список команд:
/about - это сообщение
/weather - узнать погоду
/city ГОРОД~КОДСТРАНЫ - сменить город(ex: /city Москва~RUS); код страны нужно писать в соответствии с ISO 3166
/notifications - включить/выключить уведомления(каждый день в 12:00 вас будет уведомлять о погоде)
Данные о погоде получены благодаря https://openweathermap.org`, Markup.inlineKeyboard([Markup.button.url("Source", "https://github.com/Yoursemmpai/weatherbot")]));
});

bot.hears(/^\/city .*$/i, ctx => {
	let tempArr = ctx.message.text.substr(6).split("~");
	rq({method: "GET", uri: "http://api.openweathermap.org/geo/1.0/direct", qs: {
		q: `${tempArr[0]},${tempArr[1]}`,
		appid,
		lang: 'ru'
	}}).then(res => {
		res = JSON.parse(res);
		if (!res.length) return ctx.reply("city not found");
		users[ctx.from.id].city = res[0].name;
		users[ctx.from.id].country = res[0].country;
		users[ctx.from.id].lat = res[0].lat;
		users[ctx.from.id].lon = res[0].lon;
		rq({method: "GET", uri: "http://api.openweathermap.org/data/2.5/weather", qs: {
		lat: res[0].lat,
		lon: res[0].lon,
		appid,
		lang: "ru",
		units: "metric"
		}}).then(response => {
			response = JSON.parse(response);
			users[ctx.from.id].timezone = response.timezone;
			if (users[ctx.from.id].notifications.isOn) {users[ctx.from.id].notifications.isOn = false; jobs[ctx.from.id].stop(); ntf(users[ctx.from.id]);}
		});
		ctx.reply("your city successfuly edited");
	});
});

bot.hears("/weather", ctx => {
	sendWeather(users[ctx.from.id]).then(res => ctx.reply(res));
});

bot.hears("/notifications", ctx => {
	ctx.reply(ntf(users[ctx.from.id]));
});

setInterval(time => fs.writeFileSync("users.json", JSON.stringify(users, null, "\t")), 5000);

bot.launch();