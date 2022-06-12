import {ApiPromise, Keyring} from '@polkadot/api'
import {u8aToHex} from '@polkadot/util'
import {ContractPromise} from '@polkadot/api-contract'
import {Key, useEffect, useRef, useState} from 'react'
import {signCertificate, CertificateData} from '@phala/sdk'
import {Button} from 'baseui/button'
import {Block} from 'baseui/block'
import {Input} from 'baseui/input'
import {toaster} from 'baseui/toast'
import {StyledLink} from 'baseui/link'
import {HeadingMedium, ParagraphSmall} from 'baseui/typography'
import {StatefulPanel} from 'baseui/accordion'
import {useAtom} from 'jotai'
import accountAtom from '../atoms/account'
import {getSigner} from '../lib/polkadotExtension'
import ContractLoader from '../components/ContractLoader'
import {copy} from '../lib/copy'
import useInterval from '../hooks/useInterval'
import {Textarea} from 'baseui/textarea'
import Jimp from 'jimp';

const QR: Page = () => {
  // Basic states for contract interaction
  const [account] = useAtom(accountAtom)
  const [certificateData, setCertificateData] = useState<CertificateData>()
  const [api, setApi] = useState<ApiPromise>()
  const [contract, setContract] = useState<ContractPromise>()

  // UI-related states
  const [selectedFile, setSelectedFile] = useState('')
  const [redemptionCode, setRedemptionCode] = useState('')
  const [verified, setVerified] = useState(false)
  const [devParam, setDevParam] = useState('')
  const redemptionCodeToastKey = useRef<Key>()

  useEffect(
    () => () => {
      api?.disconnect()
    },
    [api]
  )

  // Reset the UI when the selected account is changed
  useEffect(() => {
    if (account) {
      //const keyring = new Keyring()
      // u8aToHex(keyring.decodeAddress(account.address))
    }
    setVerified(false)
    setSelectedFile('')
    setRedemptionCode('')
    setCertificateData(undefined)
  }, [account])

  // Try to read the POAP code from the Fat Contract
  const getRedemptionCode = async () => {
    if (!certificateData || !contract) return

    if (!redemptionCodeToastKey.current) {
      redemptionCodeToastKey.current = toaster.info(
        'Requesting POAP redemption code...',
        {
          autoHideDuration: 0,
        }
      )
    }

    // Send a query to the POAP contract (`FatSample::my_poap()`)
    const {output} = await contract.query.myPoap(certificateData as any, {})
    const code = output?.toString()

    if (code) {
      toaster.clear(redemptionCodeToastKey.current)
      setRedemptionCode(code)
    }
  }

  // Once the Gist is attested, we start to refresh the redemption code every 2s
  useInterval(
    () => {
      getRedemptionCode()
    },
    verified && !redemptionCode ? 2000 : null
  )

  const onSignCertificate = async () => {
    if (account && api) {
      try {
        const signer = await getSigner(account)

        // Save certificate data to state, or anywhere else you want like local storage
        setCertificateData(
          await signCertificate({
            api,
            account,
            signer,
          })
        )
        toaster.positive('Certificate signed', {})
      } catch (err) {
        toaster.negative((err as Error).message, {})
      }
    }
  }

  const sendImage = async (w, h, luma) => {
    // Send a query to attest the gist from the given url.
    const {output} = await contract.query.processQr(
      certificateData as any,
      {},
      {"width": w, "height": h, "data": luma}
    )

    // outputJson is a `Result<SignedAttestation>`
    const outputJson = output?.toJSON() as any
    console.log(outputJson);

    if (outputJson.ok) {
      toaster.positive('Gist verified successfully', {})
      // We have received the attestation from the worker. Now send a command to redeem the POAP
      // with the attestation.
      const toastKey = toaster.info('Sending redeem transaction...', {
        autoHideDuration: 0,
      })
      try {
        // Send the command
        const signer = await getSigner(account)
        await contract.tx
          .redeem({}, outputJson.ok)
          .signAndSend(account.address, {signer}, (status) => {
            if (status.isFinalized) {
              toaster.clear(toastKey)
              toaster.positive('Transaction is finalized', {})
              // After the transaction is included in a finalized block, we start to poll the Fat
              // Contract to see if we can get the redemption code. This will start the 2s timer.
              setVerified(true)
            }
          })
      } catch (err) {
        toaster.clear(toastKey)
        toaster.negative((err as Error).message, {})
      }
    } else {
      toaster.negative(outputJson.err, {})
    }
  }

  // Logic of the Verify button
  const onVerify = async () => {
    if (!certificateData || !contract || !account) return
    setVerified(false)

    Jimp.read(URL.createObjectURL(selectedFile))
      .then(image => {
        console.log(image.bitmap.width);
        console.log(image.bitmap.height);
        var lumaData = [];
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
          var red = image.bitmap.data[idx + 0];
          var green = image.bitmap.data[idx + 1];
          var blue = image.bitmap.data[idx + 2];
          //var alpha = this.bitmap.data[idx + 3];
          var luma = Math.max(0, Math.min(255, Math.round(0.2126*red + 0.7152*green + 0.0722*blue)));
          lumaData.push(luma);
          if (x == image.bitmap.width - 1 && y == image.bitmap.height - 1) {
            console.log(lumaData);
            sendImage(image.bitmap.width, image.bitmap.height, lumaData);
          }
        });
      });
  }

  return contract ? (
    certificateData ? (
      <>
        <HeadingMedium marginTop="scale1000" as="h1">
          1. Select your image
        </HeadingMedium>

        <Block display="flex">
          <Input
            type="file"
            overrides={{
              Root: {
                style: ({$theme}) => ({
                  flex: 1,
                  marginRight: $theme.sizing.scale400,
                }),
              },
            }}
            onChange={(e) => setSelectedFile(e.target.files[0])}
          />
          <Button
            onClick={onVerify}
            kind="secondary"
          >
            Send To Contract
          </Button>
        </Block>

        <HeadingMedium marginTop="scale1000" as="h1">
          3. Get POAP Redemption Code
        </HeadingMedium>
        <ParagraphSmall>
          Your POAP redemption code will appear here when your gist is
          successfully verified
        </ParagraphSmall>

        <Block display="flex">
          <Input
            overrides={{
              Root: {
                style: ({$theme}) => ({
                  flex: 1,
                  marginRight: $theme.sizing.scale400,
                }),
              },
            }}
            value={redemptionCode}
            disabled={!redemptionCode}
          />
          <Button
            disabled={!redemptionCode}
            onClick={() => copy(redemptionCode)}
            kind="secondary"
          >
            Copy
          </Button>
        </Block>
      </>
    ) : (
      <Button disabled={!account} onClick={onSignCertificate}>
        Sign Certificate
      </Button>
    )
  ) : (
    <ContractLoader
      name="qr"
      onLoad={({api, contract}) => {
        setApi(api)
        setContract(contract)
      }}
    />
  )
}

QR.title = 'QR Fat Contract'

export default QR