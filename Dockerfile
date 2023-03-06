FROM node:19.7
WORKDIR /var/www/5scontrol
COPY . .
RUN npm i

ENTRYPOINT ["node", "onvif.js"]