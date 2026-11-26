<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img src="docs/assets/logo-light.svg" alt="Дедов гараж" width="420">
  </picture>
</p>

**Дедов гараж** — браузерная игра про старую японскую машину, которую дед оставил внуку. На дворе ноябрь 2004-го. Дед годами гонялся с соседом Палычем. Теперь внуку предстоит собрать машину, пройти обкатку и попробовать обогнать Палыча в заезде на 400 метров.

[Играть в браузере](https://makedonskiyy.github.io/grandpa-garage/)

![Синий автомобиль на обкаточном автодроме](docs/assets/screenshots/autodrome.webp)

## Управление

**W / ↑** — газ, **S / ↓** — тормоз, **Пробел** — ручник. На ручной коробке **E** включает первую на зелёный и повышает передачу в движении, **Q** понижает. Автомат можно включить в настройках.

## Локальный запуск

Понадобятся Git и Node.js 22.12 или новее.

```bash
git clone https://github.com/Makedonskiyy/grandpa-garage.git
cd grandpa-garage
npm ci
npm run dev
```

Откройте адрес, который появится в терминале.

[Лицензия GPL-3.0](LICENSE)
