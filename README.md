<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo-light.svg" alt="Дедов гараж" width="520">
  </picture>
</p>

<p align="center">
  <a href="https://makedonskiyy.github.io/grandpa-garage/"><img src="https://img.shields.io/badge/%D0%98%D0%B3%D1%80%D0%B0%D1%82%D1%8C-%D0%BE%D0%BD%D0%BB%D0%B0%D0%B9%D0%BD-eea45a?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Играть онлайн"></a>
  <a href="https://github.com/Makedonskiyy/grandpa-garage/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Makedonskiyy/grandpa-garage/ci.yml?branch=main&style=for-the-badge&label=CI&logo=githubactions&logoColor=white" alt="CI"></a>
  <a href="https://github.com/Makedonskiyy/grandpa-garage/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/Makedonskiyy/grandpa-garage/deploy.yml?branch=main&style=for-the-badge&label=Pages&logo=github&logoColor=white" alt="Деплой на GitHub Pages"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue?style=for-the-badge" alt="Лицензия GPL-3.0"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Phaser-3.90-6b4fbb?style=flat-square" alt="Phaser 3.90">
  <img src="https://img.shields.io/badge/Vite-8-646cff?style=flat-square&logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/JavaScript-vanilla-f7df1e?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 20+">
  <img src="https://img.shields.io/badge/%D0%B2%D0%B5%D1%80%D1%81%D0%B8%D1%8F-0.1.0-eea45a?style=flat-square" alt="Версия 0.1.0">
</p>

<p align="center"><b>Браузерная 2D-игра в пиксельной графике</b></p>

<p align="center">
  <img src="docs/assets/screenshots/garage.png" alt="Гараж: сборка машины" width="800">
</p>

## О чём игра

События происходят 22 ноября 2004 года. Дед насовсем уехал на дачу в другой город и оставил внуку гараж и свою старую японку. В гараже он оставил записку: одиннадцать лет он гонялся с соседом Палычем и ни разу его не обогнал. Нужно собрать машину и сделать это за них обоих.

## Как играть

1. Нажмите «Начать игру» и погрузитесь в предысторию, слушая диалоги.
2. В гараже соберите машину: колёса, двигатель, кузов и, если нужно, спойлер.
3. Пройдите обкатку по раскисшей грунтовке.
4. Переделайте машину так, чтобы обогнать Палыча на 400 метрах.
5. Если не получилось, игра объяснит причину, а сборку можно изменить и попробовать снова.

## Управление

Игра управляется мышью. Заезды едут сами: результат зависит от того, как собрана машина, передачи переключаются автоматически. Обкатку можно ускорить кнопкой «Ускорить ×2», <kbd>Esc</kbd> открывает настройки. Внешний вид машины на результат не влияет.

## Скриншоты

<table>
  <tr>
    <td><img src="docs/assets/screenshots/menu.png" alt="Главное меню"></td>
    <td><img src="docs/assets/screenshots/story.png" alt="Сцена истории"></td>
  </tr>
  <tr>
    <td><img src="docs/assets/screenshots/note.png" alt="Записка деда"></td>
    <td><img src="docs/assets/screenshots/trial.png" alt="Обкатка"></td>
  </tr>
</table>

## Запуск

Игру можно открыть по ссылке: **https://makedonskiyy.github.io/grandpa-garage/**

Для локального запуска нужны [Node.js](https://nodejs.org/) 20 или новее и [Git](https://git-scm.com/):

```bash
git clone https://github.com/Makedonskiyy/grandpa-garage.git
cd grandpa-garage
npm install
npm run dev
```

Откройте адрес из терминала (обычно http://localhost:5173).

<details>
<summary>Другие команды</summary>

| Команда           | Что делает                                       |
| ----------------- | ------------------------------------------------ |
| `npm run build`   | Сборка в папку `dist`                            |
| `npm run preview` | Запуск собранной версии                          |
| `npm test`        | Тесты                                            |
| `npm run check`   | Линтер, форматирование, тесты и сборка разом     |
| `npm run car`     | Пересобрать пиксельную машину из генератора      |
| `npm run art`     | Пересобрать пиксельные фоны из исходных картинок |

</details>

## Лицензия

Код распространяется под лицензией [GNU GPL v3.0](LICENSE). Шрифты Literata и Caveat — под SIL Open Font License 1.1, иконки Lucide — под лицензией ISC.
