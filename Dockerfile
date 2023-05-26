FROM node:19.7
RUN apt-get update
RUN apt-get install ffmpeg -y
WORKDIR /var/www/5scontrol
COPY package.json .
RUN npm i
COPY . .

ENTRYPOINT ["node", "onvif.js"]