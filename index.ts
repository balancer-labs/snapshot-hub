import serveStatic from 'serve-static';
import bodyParser from 'body-parser';
// @ts-ignore
import frameguard from 'frameguard';
import cors from 'cors';
import api from './server/api';

export default (app, server) => {
  app.use(bodyParser.json({ limit: '20mb' }));
  app.use(bodyParser.urlencoded({ limit: '20mb', extended: false }));
  app.use(frameguard({ action: 'deny' }));
  app.use(cors());
  // @ts-ignore
  app.use(serveStatic(`${__dirname}/dist`));
  app.use('/api', api);
  // @ts-ignore
  app.get('/', (req, res) => res.sendFile(`${__dirname}/dist/index.html`));
  app.get('*', (req, res) => res.redirect('/'));
}