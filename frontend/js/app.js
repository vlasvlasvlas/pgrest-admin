import { Engine } from './engine.js';
import { Toast } from './components/toast.js';

async function bootstrap() {
  const engine = new Engine();
  try {
    await engine.init();
  } catch (err) {
    console.error(err);
    Toast.error(err.message || 'Error inicializando la aplicacion');
  }
}

bootstrap();
