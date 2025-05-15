/if (isProd) {/,/^\s*\/\/ TODO: load draft, post, record results\s*\/\/}/ {
  if (/if (isProd) {/) {
    print "if (isProd) {"
    print "  const Redis = require('ioredis');"
    redis_url = ENVIRON[\"REDIS_URL\"]
    print "  const redisUrl = redis_url;"
    print "  console.log(\"ℹ️ REDIS_URL in production:\", redisUrl); // Keep this line"
    print ""
    print "  const redisOptions = {"
    print "    createClient: (type, redisOpts) => {"
    print "      if (type === 'client' || type === 'subscriber') {"
    print "        return new Redis(redisUrl, { tls: {} });"
    print "      }"
    print "    },"
    print "  };"
    print ""
    print "  scheduleQueue = new Bull('scheduleQueue', redisOptions);"
    print "  scheduleQueue.on('error', error => console.error('🚨 Bull Queue Error:', error));"
    print "  scheduleQueue.process(async job => {"
    print "    console.log('🕒 Running job:', job.id, job.data);"
    print "    // TODO: load draft, post, record results"
    print "  });"
    print "  console.log('⚙️ Bull queue initialized for production.');"
  }
}

/^\s*\/\/ — Auth routes —/ { print }

!/if (isProd) {/,/^\s*\/\/ TODO: load draft, post, record results\s*\/\/}/ {
  if (!/if (isProd) {/ && !/^\s*\/\/ TODO: load draft, post, record results\s*\/\/}/) {
    print
  }
}
