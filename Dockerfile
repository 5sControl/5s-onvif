FROM node:19.7
RUN apt-get update
RUN apt-get install ffmpeg -y
WORKDIR /var/www/5scontrol
COPY package.json .
RUN npm i
COPY . .
RUN mkdir -p /var/www/5scontrol/images
ENV IMAGES_DIR=/var/www/5scontrol/images
ENV BASE_URL=http://localhost:3456

ENTRYPOINT ["node", "onvif.js"]