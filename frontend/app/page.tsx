export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Animated Ambient Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-400 rounded-full opacity-10 blur-3xl animate-pulse"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      <div className="absolute top-1/2 right-1/4 w-72 h-72 bg-pink-400 rounded-full opacity-10 blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
      
      <div className="max-w-4xl w-full space-y-12 relative z-10">
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <div className="inline-block">
            <h1 className="text-display font-extralight gradient-text mb-2">
              Evala
            </h1>
            <div className="h-1 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 rounded-full glow-purple"></div>
          </div>
          <p className="text-xl text-gray-600 font-light max-w-2xl mx-auto">
            Decentralized Human Validation Engine on Sui
          </p>
          <p className="text-sm text-gray-500 font-light">
            Real people. Real feedback. Real rewards.
          </p>
        </div>

        {/* Main Navigation Cards */}
        <div className="grid md:grid-cols-4 gap-6">
          <a href="/upload" className="group neuro-card hover:scale-105 transition-all duration-300">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-[20px] bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center glow-blue group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800">Upload</h3>
              <p className="text-sm text-gray-600 font-light">Submit content variations</p>
            </div>
          </a>

          <a href="/vote" className="group neuro-card hover:scale-105 transition-all duration-300">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-[20px] bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center glow-purple group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800">Vote</h3>
              <p className="text-sm text-gray-600 font-light">Validate and earn</p>
            </div>
          </a>

          <a href="/rewards" className="group neuro-card hover:scale-105 transition-all duration-300">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-[20px] bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center glow-blue group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800">Rewards</h3>
              <p className="text-sm text-gray-600 font-light">Fund & distribute</p>
            </div>
          </a>

          <a href="/dashboard" className="group neuro-card hover:scale-105 transition-all duration-300">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-[20px] bg-gradient-to-br from-pink-400 to-pink-600 flex items-center justify-center glow-pink group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-800">Dashboard</h3>
              <p className="text-sm text-gray-600 font-light">Track reputation</p>
            </div>
          </a>
        </div>

        {/* Features */}
        <div className="glass-panel">
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-2xl font-light text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 mb-2">On-Chain</div>
              <p className="text-xs text-gray-600 font-light">Transparent & Immutable</p>
            </div>
            <div>
              <div className="text-2xl font-light text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 mb-2">Human-Powered</div>
              <p className="text-xs text-gray-600 font-light">Real Validation</p>
            </div>
            <div>
              <div className="text-2xl font-light text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-blue-600 mb-2">Rewarded</div>
              <p className="text-xs text-gray-600 font-light">Earn as You Validate</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
