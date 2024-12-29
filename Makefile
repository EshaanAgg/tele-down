clean:
	rm -rf bot/unzipped
	cp server/server server_bin
	rm -rf server
	mkdir server
	mv server_bin server/server

run:
	make clean
	./run.sh &
	cd bot && npm install && npm run start