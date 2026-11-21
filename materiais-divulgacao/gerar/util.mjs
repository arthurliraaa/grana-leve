import * as L from '../../tests/e2e/lib.js';
export {L};
// Rola até o elemento deixando `folga` px acima (o topo fixo do app ocupa ~68 px).
export async function rolarPara(page, sel, folga = 84, suave = false){
  await page.evaluate((s, f, su) => { const y = document.querySelector(s).getBoundingClientRect().top + window.scrollY - f; window.scrollTo({top: Math.max(0, y), behavior: su ? 'smooth' : 'instant'}); }, sel, folga, suave);
}
export async function abrirChat(page){
  await page.click('#fabAdd'); await L.sleep(450); await page.click('[data-m-chat]'); await L.sleep(550);
}
