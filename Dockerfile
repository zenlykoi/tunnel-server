FROM node:16.18.0

WORKDIR /app

COPY package.json /app/

RUN npm i

COPY . /app

ENTRYPOINT ["node", "./src/index.js"]