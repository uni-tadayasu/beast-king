/** Public guide pages share the same local feedback preferences as the game. */
import {createExperienceController} from './experience-fx.js?v=20261124-32';
document.addEventListener('contextmenu',event=>event.preventDefault(),true);

const start = () => {
  // Interactive applications own one controller bound to their saved settings.
  if (document.querySelector('#app')) return;
  const experience = createExperienceController();
  experience?.screen('guide');
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
else start();
