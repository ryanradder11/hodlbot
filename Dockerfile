FROM node:carbon

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install
RUN npm install forever -g

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
