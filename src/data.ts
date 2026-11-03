// Data menu dari PDF menu resmi Greenbox (Linktree, September 2026).
export type Level = 'A' | 'B' | 'C' | 'D'
export type Serve = 'hot' | 'ice' | 'both'
export type Drink = { name: string; level: Level; serve: Serve; price: string; beans?: string }
export type Food = { name: string; kcal: string; price: string; desc?: string }

export const BEANS: Record<string, [string, string]> = {
  c: ['Classic', '#7F4A0D'], f: ['Fruity', '#FF8A4C'], d: ['Decaf', '#A8DFC5'], s: ['Single-origin', '#F0E072'],
}

const d = (name: string, level: Level, serve: Serve, price: string, beans?: string): Drink => ({ name, level, serve, price, beans })

export const DRINKS: { id: string; title: string; note: string; color: string; items: Drink[] }[] = [
  { id: 'espresso', title: 'Espresso based', note: 'pilih biji: classic, fruity, decaf', color: '#1FC21B', items: [
    d('Espresso', 'A', 'hot', '28 K', 'cfd'), d('Long Black', 'A', 'hot', '28 K', 'cfd'), d('Iced Black', 'A', 'ice', '28 K', 'cfd'),
    d('Latte', 'C', 'hot', '32 K', 'cfd'), d('Cappuccino', 'C', 'hot', '32 K', 'cfd'), d('Piccolo', 'C', 'hot', '32 K', 'cfd'),
    d('Magic White 6oz', 'C', 'hot', '38 K', 'cfd'), d('Iced White', 'C', 'ice', '35 K', 'cfd'), d('Dirty Latte', 'C', 'ice', '45 K', 'cfd'),
    d('WOC (White On Crack)', 'C', 'ice', '45 K', 'cfd')] },
  { id: 'filter', title: 'Filtered coffee', note: 'single-origin', color: '#F0E072', items: [
    d('Pour Over Coffee', 'A', 'hot', '32 K', 's'), d('Iced Pour Over Coffee', 'A', 'ice', '35 K', 's'), d('Cold Brewed Coffee', 'A', 'ice', '32 K', 's'),
    d('Mont Blanc', 'C', 'ice', '38 K', 's'), d('Cold Brew Sorbet', 'C', 'ice', '34 K', 's')] },
  { id: 'cloud', title: 'Cloud series', note: 'comfort beneath, soft above', color: '#A8DFC5', items: [
    d('Coffee Cloud', 'D', 'ice', '38 K'), d('Oolong Cloud', 'D', 'ice', '38 K')] },
  { id: 'rtd', title: 'RTD', note: 'kaleng 300 ml', color: '#272924', items: [
    d('RTD Classic', 'C', 'ice', '40 K'), d('RTD Fruity', 'C', 'ice', '40 K'), d('RTD Decaf', 'C', 'ice', '40 K'),
    d('Sunset Soother', 'D', 'ice', '38 K'), d('Sunrise Booster', 'D', 'ice', '38 K')] },
  { id: 'noncoffee', title: 'Non-coffee', note: 'tanpa kopi', color: '#FFB48A', items: [
    d('70% Chocolate', 'D', 'both', '45 K'), d('Matcha Latte', 'D', 'both', '40 K'), d('Pecan Praline Matcha', 'D', 'both', '40 K')] },
  { id: 'tea', title: 'Iced shaken tea', note: 'dikocok dingin', color: '#A8DFC5', items: [
    d('Iced Shaken Honey Lemon Tea', 'D', 'ice', '28 K'), d('Iced Shaken Mixed Berries Tea', 'D', 'ice', '28 K')] },
  { id: 'refresh', title: 'Refreshment', note: 'segar', color: '#E06A5F', items: [
    d('Red Box', 'D', 'ice', '38 K'), d('Napkin', 'D', 'ice', '38 K')] },
]

export const MILK = [['Decaf Coffee', '+5 K'], ['Distilled Milk Blend', '+10 K'], ['Lactose Free Milk', '+5 K'], ['Cashew Milk', '+5 K']]

export const FOODS: { id: string; title: string; note: string; color: string; items: Food[] }[] = [
  { id: 'main', title: 'Main', note: 'piring utama', color: '#1FC21B', items: [
    { name: 'Easy-Nasgor', kcal: '±640 kcal', price: '35 K', desc: 'Nasi goreng mentega dengan ayam, telur goreng, dan salad sayur.' },
    { name: 'Sesame-Pasta', kcal: '±674 kcal', price: '40 K', desc: 'Pasta saus wijen gurih, potongan ayam, dan onsen egg.' },
    { name: 'Nanban Chicken With Rice', kcal: '±810 kcal', price: '38,5 K', desc: 'Nasi bawang putih, ayam tepung berbalut shoyu glaze, saus nanban, salad, dan nori.' },
    { name: 'Salad With Pan-seared Chicken', kcal: '±367 kcal', price: '37 K', desc: 'Timun, endive, romaine, acar kubis ungu, tomat ceri, dan ayam pan-seared.' },
    { name: 'Beef-Sando', kcal: '±413 kcal', price: '53 K', desc: 'Toast isi roast beef, romaine, tomat, acar timun, saus barbeku, dengan fries.' },
    { name: 'Pad Kra Pao', kcal: '±312 kcal', price: '35,5 K', desc: 'Nasi dengan ayam kemangi, telur goreng, dan salad sayur.' }] },
  { id: 'snack', title: 'Snack', note: 'buat dibagi', color: '#F0E072', items: [
    { name: 'Real Potato Fries', kcal: '±230 kcal', price: '20 K' }, { name: 'Enoki Fries', kcal: '±282 kcal', price: '25 K' }] },
  { id: 'dessert', title: 'Dessert', note: 'penutup', color: '#FFB48A', items: [
    { name: 'Soft-Panna', kcal: '±218 kcal', price: '22 K' }, { name: 'Sweet Waffle', kcal: '±403 kcal', price: '20 K' }, { name: 'Coffee Parfait', kcal: '±502 kcal', price: '33,5 K' }] },
]

export const TOTAL = [...DRINKS, ...FOODS].reduce((n, g) => n + g.items.length, 0)

export const WA = 'https://wa.me/6281937866638'
export const MAPS = 'https://maps.app.goo.gl/Zh8FpM7QJAX6p9c97'
