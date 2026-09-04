/** Realistic header blocks for working on the task pane outside Outlook. */
export const FIXTURES: ReadonlyArray<{ name: string; headers: string }> = [
  {
    name: "Gmail → Exchange Online, stalled at the edge",
    headers: `Received: from BN8PR12MB3456.namprd12.prod.outlook.com (2603:10b6:408:6c::13)
 by DM6PR12MB4567.namprd12.prod.outlook.com with HTTPS; Thu, 4 Sep 2026
 16:50:12 +0000
Received: from MW4PR03CA0123.namprd03.prod.outlook.com (2603:10b6:303:b4::8) by
 BN8PR12MB3456.namprd12.prod.outlook.com (2603:10b6:408:6c::13) with Microsoft
 SMTP Server (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384) id
 15.20.6792.29; Thu, 4 Sep 2026 16:50:10 +0000
Received: from mail-wr1-f54.google.com (209.85.221.54) by
 MW4PR03CA0123.outlook.office365.com (10.174.208.35) with Microsoft SMTP Server
 (version=TLS1_2, cipher=TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256) id
 15.20.6792.29 via Frontend Transport; Thu, 4 Sep 2026 16:49:52 +0000
Received: by mail-wr1-f54.google.com with SMTP id abc123so456789wrx.11
        for <duane@example.com>; Thu, 04 Sep 2026 09:45:30 -0700 (PDT)
Date: Thu, 4 Sep 2026 09:45:28 -0700
From: Alice Example <alice@gmail.com>
To: duane@example.com
Subject: Quarterly numbers
Message-ID: <CAF=abc123@mail.gmail.com>
Authentication-Results: spf=pass (sender IP is 209.85.221.54) smtp.mailfrom=gmail.com; dkim=pass header.d=gmail.com; dmarc=pass action=none
X-MS-Exchange-Transport-EndToEndLatency: 00:04:42.1093750`,
  },
  {
    name: "Held 34 minutes in a filtering gateway",
    headers: `Received: from mx.example.net (mx.example.net [198.51.100.20]) by
 mail.example.com (Postfix) with ESMTPS id 4Xk8vT2 for <duane@example.com>;
 Thu, 4 Sep 2026 11:12:41 +0000
Received: from filter-07.securemail.example (filter-07.securemail.example
 [203.0.113.44]) by mx.example.net (Postfix) with ESMTPS id 4Xk8vS1;
 Thu, 4 Sep 2026 11:12:38 +0000
Received: from smtp.partner.example (smtp.partner.example [192.0.2.15])
 by filter-07.securemail.example (Postfix) with ESMTPS id 9AbC22
 (using TLSv1.3 cipher TLS_AES_256_GCM_SHA384); Thu, 4 Sep 2026 11:12:30 +0000
Received: from workstation.partner.example (unknown [10.20.30.40])
 by smtp.partner.example (Postfix) with ESMTPSA id 77De11;
 Thu, 4 Sep 2026 10:38:02 +0000
Date: Thu, 4 Sep 2026 10:38:01 +0000
From: Priya Raman <priya@partner.example>
To: duane@example.com
Subject: Signed contract attached
Message-ID: <20260904103801.77De11@smtp.partner.example>`,
  },
  {
    name: "Servers disagreeing about the time",
    headers: `Received: from b.example.com by c.example.com with ESMTP id 33;
 Thu, 4 Sep 2026 10:00:30 +0000
Received: from a.example.com (a.example.com [192.0.2.9]) by b.example.com
 (Exim 4.96) with ESMTPS id 22; Thu, 4 Sep 2026 10:00:45 +0000
Received: from client.example.com by a.example.com with SMTP id 11;
 Thu, 4 Sep 2026 09:59:58 +0000
Date: Thu, 4 Sep 2026 09:59:57 +0000
From: Sam <sam@example.com>
To: duane@example.com
Subject: Re: lunch`,
  },
];
