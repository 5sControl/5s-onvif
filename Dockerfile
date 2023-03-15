FROM node:19.7
RUN apt-get update
RUN apt-get install ffmpeg -y
WORKDIR /var/www/5scontrol
COPY . .
RUN npm i

ENTRYPOINT ["node", "onvif.js"]